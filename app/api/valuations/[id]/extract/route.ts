import { NextResponse } from "next/server";
import { requireProfile } from "../../../../../lib/auth";
import { extractDocumentText } from "../../../../../lib/document-ocr";
import { extractTripuraValuation } from "../../../../../lib/openai-extraction";
import { AI_CREDITS_EXHAUSTED_MESSAGE, isAiCreditsExhausted } from "../../../../../lib/openai-errors";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile(); if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data: valuation } = await context.supabase.from("valuations").select("id,state_code,status").eq("id", id).single();
  if (!valuation || !["UPLOADING", "DRAFT"].includes(valuation.status)) return NextResponse.json({ error: "This valuation cannot be extracted." }, { status: 409 });
  const { data: documents } = await context.supabase.from("valuation_documents").select("id,kind,original_filename,mime_type,storage_path,ocr_text").eq("valuation_id", id);
  if (!documents?.length) return NextResponse.json({ error: "Upload at least one document before extraction." }, { status: 422 });
  const uploadedKinds = new Set(documents.map((document) => document.kind));
  if (!uploadedKinds.has("SALE_DEED") || !uploadedKinds.has("KHATIYAN")) return NextResponse.json({ error: "Sale Deed and Khatiyan are mandatory before starting a valuation." }, { status: 422 });
  const { data: rules } = await context.supabase.from("state_rule_versions").select("id,content").eq("state_code", valuation.state_code).eq("kind", "EXTRACTION").eq("status", "PUBLISHED").single();
  if (!rules) return NextResponse.json({ error: "No published extraction rules exist for this state." }, { status: 409 });
  const { data: run, error: runError } = await context.supabase.from("extraction_runs").insert({ valuation_id: id, status: "RUNNING", model: process.env.OPENAI_EXTRACTION_MODEL || "gpt-5", input_snapshot: { documentIds: documents.map(d => d.id), ruleId: rules.id }, started_at: new Date().toISOString() }).select().single();
  if (runError) return NextResponse.json({ error: runError.message }, { status: 400 });
  try {
    await context.supabase.from("valuations").update({ status: "EXTRACTING", processing_error: null }).eq("id", id);
    const admin = createSupabaseAdminClient();
    const transcribedDocuments: Array<{ id: string; name: string; text: string }> = [];

    for (const document of documents) {
      let documentText = document.ocr_text;
      if (!documentText) {
        await context.supabase.from("valuation_documents").update({
          processing_metadata: { ocrStatus: "RUNNING", ocrProvider: "openai-responses", mode: "on-start-valuation" },
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
            processing_metadata: { ocrStatus: "COMPLETE", ocrProvider: "openai-responses", mode: "on-start-valuation" },
          }).eq("id", document.id);
          if (updateError) throw new Error(updateError.message);
          await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "DOCUMENT_OCR_COMPLETED", payload: { documentId: document.id, provider: "openai-responses", mode: "on-start-valuation" } });
        } catch (ocrError) {
          const message = ocrError instanceof Error ? ocrError.message : "Document text extraction failed.";
          await context.supabase.from("valuation_documents").update({ processing_metadata: { ocrStatus: "FAILED", mode: "on-start-valuation", error: message } }).eq("id", document.id);
          await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "DOCUMENT_OCR_FAILED", payload: { documentId: document.id, mode: "on-start-valuation" } });
          throw ocrError;
        }
      }
      transcribedDocuments.push({ id: document.id, name: document.original_filename, text: documentText });
    }

    const extracted = await extractTripuraValuation({ rules: rules.content, documents: transcribedDocuments });
    await context.supabase.from("extraction_runs").update({ status: "COMPLETE", output: extracted, evidence: extracted.evidence, contradictions: extracted.contradictions, completed_at: new Date().toISOString() }).eq("id", run.id);
    await context.supabase.from("valuations").update({ status: "REVIEW_REQUIRED", extraction_data: extracted, extraction_rule_id: rules.id }).eq("id", id);
    await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "EXTRACTION_COMPLETED", payload: { extractionRunId: run.id, contradictions: extracted.contradictions.length } });
    return NextResponse.json({ extraction: extracted, runId: run.id });
  } catch (error) {
    await context.supabase.from("extraction_runs").update({ status: "FAILED", error: error instanceof Error ? error.message : "Unknown extraction error", completed_at: new Date().toISOString() }).eq("id", run.id);
    if (isAiCreditsExhausted(error)) return NextResponse.json({ error: AI_CREDITS_EXHAUSTED_MESSAGE, code: "AI_CREDITS_EXHAUSTED" }, { status: 402 });
    await context.supabase.from("valuations").update({ status: "UPLOADING", processing_error: "Extraction failed. Review the uploaded files and try again." }).eq("id", id);
    return NextResponse.json({ error: "Extraction failed." }, { status: 502 });
  }
}
