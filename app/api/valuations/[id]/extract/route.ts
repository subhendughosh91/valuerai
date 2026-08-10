import { NextResponse } from "next/server";
import { requireProfile } from "../../../../../lib/auth";
import { extractDocumentText } from "../../../../../lib/document-ocr";
import { extractTripuraValuation } from "../../../../../lib/openai-extraction";
import { normalizeExtractedFields, runExtractionConsistencyChecks } from "../../../../../lib/openai-extraction-postprocessing";
import { AI_CREDITS_EXHAUSTED_MESSAGE, isAiCreditsExhausted } from "../../../../../lib/openai-errors";
import { getAiModelConfiguration } from "../../../../../lib/openai-models";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile(); if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data: valuation } = await context.supabase.from("valuations").select("id,state_code,status,custom_instructions,extraction_data").eq("id", id).single();
  if (!valuation) return NextResponse.json({ error: "Valuation not found." }, { status: 404 });
  if (valuation.status === "REVIEW_REQUIRED" && valuation.extraction_data && Object.keys(valuation.extraction_data).length) {
    return NextResponse.json({ extraction: valuation.extraction_data, alreadyComplete: true });
  }
  if (valuation.status === "EXTRACTING") return NextResponse.json({ processing: true }, { status: 202 });
  if (!["UPLOADING", "DRAFT"].includes(valuation.status)) return NextResponse.json({ error: "Extraction is not available at the current valuation stage." }, { status: 409 });
  const { data: documents } = await context.supabase.from("valuation_documents").select("id,kind,other_document_types,original_filename,mime_type,storage_path,ocr_text").eq("valuation_id", id);
  if (!documents?.length) return NextResponse.json({ error: "Upload at least one document before extraction." }, { status: 422 });
  const uploadedKinds = new Set(documents.map((document) => document.kind));
  if (!uploadedKinds.has("SALE_DEED")) return NextResponse.json({ error: "A Sale Deed is mandatory before starting a valuation." }, { status: 422 });
  const { data: publishedRules } = await context.supabase.from("state_rule_versions").select("id,kind,content").eq("state_code", valuation.state_code).eq("status", "PUBLISHED").in("kind", ["EXTRACTION", "LAND"]);
  const extractionRule = publishedRules?.find((rule) => rule.kind === "EXTRACTION");
  const landRule = publishedRules?.find((rule) => rule.kind === "LAND");
  if (!extractionRule) return NextResponse.json({ error: "No published extraction rules exist for this state." }, { status: 409 });
  if (!landRule) return NextResponse.json({ error: "No published land rules exist for this state." }, { status: 409 });

  // Claim the valuation before creating a run so double-clicks and other tabs
  // cannot start duplicate extraction work.
  const { data: claimed, error: claimError } = await context.supabase
    .from("valuations")
    .update({ status: "EXTRACTING", processing_error: null })
    .eq("id", id)
    .in("status", ["UPLOADING", "DRAFT"])
    .select("id")
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 400 });
  if (!claimed) {
    const { data: current } = await context.supabase.from("valuations").select("status,extraction_data").eq("id", id).single();
    if (current?.status === "REVIEW_REQUIRED" && current.extraction_data && Object.keys(current.extraction_data).length) {
      return NextResponse.json({ extraction: current.extraction_data, alreadyComplete: true });
    }
    if (current?.status === "EXTRACTING") return NextResponse.json({ processing: true }, { status: 202 });
    return NextResponse.json({ error: "Extraction is not available at the current valuation stage." }, { status: 409 });
  }

  const models = getAiModelConfiguration();
  const { data: run, error: runError } = await context.supabase.from("extraction_runs").insert({ valuation_id: id, status: "RUNNING", model: models.extraction, input_snapshot: { documentIds: documents.map(d => d.id), extractionRuleId: extractionRule.id, landRuleId: landRule.id, customInstructions: valuation.custom_instructions, models: { document: models.document, extraction: models.extraction, normalization: models.normalization, consistency: models.consistency } }, started_at: new Date().toISOString() }).select().single();
  if (runError) {
    await context.supabase.from("valuations").update({ status: "UPLOADING", processing_error: "Extraction could not be started. Please try again." }).eq("id", id);
    return NextResponse.json({ error: "Extraction could not be started. Please try again." }, { status: 500 });
  }
  try {
    const admin = createSupabaseAdminClient();
    const transcribedDocuments: Array<{ id: string; kind: string; name: string; text: string }> = [];

    for (const document of documents) {
      let documentText = document.ocr_text;
      if (!documentText) {
        await context.supabase.from("valuation_documents").update({
          processing_metadata: { ocrStatus: "RUNNING", ocrProvider: "openai-responses", ocrModel: models.document, mode: "on-start-valuation" },
        }).eq("id", document.id);
        try {
          const { data: file, error: downloadError } = await admin.storage.from("valuation-documents").download(document.storage_path);
          if (downloadError || !file) throw new Error(downloadError?.message || `Unable to read ${document.original_filename}.`);
          documentText = await extractDocumentText({
            bytes: Buffer.from(await file.arrayBuffer()),
            filename: document.original_filename,
            mimeType: document.mime_type,
          });
          const completedAt = new Date().toISOString();
          const { error: updateError } = await context.supabase.from("valuation_documents").update({
            ocr_text: documentText,
            ocr_completed_at: completedAt,
            processing_metadata: { ocrStatus: "COMPLETE", ocrProvider: "openai-responses", ocrModel: models.document, mode: "on-start-valuation" },
          }).eq("id", document.id);
          if (updateError) throw new Error(updateError.message);
          await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "DOCUMENT_OCR_COMPLETED", payload: { documentId: document.id, provider: "openai-responses", model: models.document, mode: "on-start-valuation" } });
        } catch (ocrError) {
          const message = ocrError instanceof Error ? ocrError.message : "Document text extraction failed.";
          await context.supabase.from("valuation_documents").update({ processing_metadata: { ocrStatus: "FAILED", mode: "on-start-valuation", error: message } }).eq("id", document.id);
          await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "DOCUMENT_OCR_FAILED", payload: { documentId: document.id, mode: "on-start-valuation" } });
          throw ocrError;
        }
      }
      const documentKind = document.kind === "OTHER" && document.other_document_types?.length
        ? `OTHER - ${document.other_document_types.join(", ")}`
        : document.kind;
      transcribedDocuments.push({ id: document.id, kind: documentKind, name: document.original_filename, text: documentText });
    }

    const combinedRules = `EXTRACTION ENGINE INSTRUCTIONS\n${extractionRule.content}\n\nSHARED LAND RULES\n${landRule.content}`;
    const extracted = await extractTripuraValuation({ rules: combinedRules, documents: transcribedDocuments, customInstructions: valuation.custom_instructions });
    const normalized = await normalizeExtractedFields(extracted, landRule.content);
    const checked = await runExtractionConsistencyChecks(normalized, combinedRules);
    const extractionResult = checked.extraction_result;
    await context.supabase.from("extraction_runs").update({ status: "COMPLETE", output: checked, evidence: extractionResult.source_trace, contradictions: extractionResult.validation_warnings, completed_at: new Date().toISOString() }).eq("id", run.id);
    await context.supabase.from("valuations").update({ status: "REVIEW_REQUIRED", extraction_data: checked, extraction_rule_id: extractionRule.id }).eq("id", id);
    await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "EXTRACTION_COMPLETED", payload: { extractionRunId: run.id, warnings: extractionResult.validation_warnings.length, missingRequiredFields: extractionResult.missing_required_fields.length } });
    return NextResponse.json({ extraction: checked, runId: run.id });
  } catch (error) {
    await context.supabase.from("extraction_runs").update({ status: "FAILED", error: error instanceof Error ? error.message : "Unknown extraction error", completed_at: new Date().toISOString() }).eq("id", run.id);
    if (isAiCreditsExhausted(error)) return NextResponse.json({ error: AI_CREDITS_EXHAUSTED_MESSAGE, code: "AI_CREDITS_EXHAUSTED" }, { status: 402 });
    await context.supabase.from("valuations").update({ status: "UPLOADING", processing_error: "Extraction failed. Review the uploaded files and try again." }).eq("id", id);
    return NextResponse.json({ error: "Extraction failed." }, { status: 502 });
  }
}
