import { NextResponse } from "next/server";
import { requireProfile } from "../../../../../lib/auth";
import { extractTripuraValuation } from "../../../../../lib/openai-extraction";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile(); if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data: valuation } = await context.supabase.from("valuations").select("id,state_code,status").eq("id", id).single();
  if (!valuation || !["UPLOADING", "DRAFT"].includes(valuation.status)) return NextResponse.json({ error: "This valuation cannot be extracted." }, { status: 409 });
  const { data: documents } = await context.supabase.from("valuation_documents").select("id,original_filename,scan_status,ocr_text").eq("valuation_id", id);
  if (!documents?.length) return NextResponse.json({ error: "Upload at least one document before extraction." }, { status: 422 });
  if (documents.some(document => !document.ocr_text)) return NextResponse.json({ error: "Document OCR has not completed. Retry shortly." }, { status: 409 });
  const { data: rules } = await context.supabase.from("state_rule_versions").select("id,content").eq("state_code", valuation.state_code).eq("kind", "EXTRACTION").eq("status", "PUBLISHED").single();
  if (!rules) return NextResponse.json({ error: "No published extraction rules exist for this state." }, { status: 409 });
  const { data: run, error: runError } = await context.supabase.from("extraction_runs").insert({ valuation_id: id, status: "RUNNING", model: process.env.OPENAI_EXTRACTION_MODEL || "gpt-5", input_snapshot: { documentIds: documents.map(d => d.id), ruleId: rules.id }, started_at: new Date().toISOString() }).select().single();
  if (runError) return NextResponse.json({ error: runError.message }, { status: 400 });
  try {
    const extracted = await extractTripuraValuation({ rules: rules.content, documents: documents.map(d => ({ id: d.id, name: d.original_filename, text: d.ocr_text! })) });
    await context.supabase.from("extraction_runs").update({ status: "COMPLETE", output: extracted, evidence: extracted.evidence, contradictions: extracted.contradictions, completed_at: new Date().toISOString() }).eq("id", run.id);
    await context.supabase.from("valuations").update({ status: "REVIEW_REQUIRED", extraction_data: extracted, extraction_rule_id: rules.id }).eq("id", id);
    await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "EXTRACTION_COMPLETED", payload: { extractionRunId: run.id, contradictions: extracted.contradictions.length } });
    return NextResponse.json({ extraction: extracted, runId: run.id });
  } catch (error) {
    await context.supabase.from("extraction_runs").update({ status: "FAILED", error: error instanceof Error ? error.message : "Unknown extraction error", completed_at: new Date().toISOString() }).eq("id", run.id);
    await context.supabase.from("valuations").update({ status: "FAILED", processing_error: "Extraction failed. Retry after resolving the issue." }).eq("id", id);
    return NextResponse.json({ error: "Extraction failed." }, { status: 502 });
  }
}
