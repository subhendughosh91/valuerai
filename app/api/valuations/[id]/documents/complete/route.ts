import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProfile } from "../../../../../../lib/auth";
import { extractDocumentText } from "../../../../../../lib/document-ocr";
import { AI_CREDITS_EXHAUSTED_MESSAGE, isAiCreditsExhausted } from "../../../../../../lib/openai-errors";
import { createSupabaseAdminClient } from "../../../../../../lib/supabase/admin";
import { documentKinds } from "../../../../../../lib/valuation-schema";

const bodySchema = z.object({ kind: z.enum(documentKinds), path: z.string().min(1), filename: z.string().min(1), mimeType: z.string().min(1), byteSize: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(), otherDocumentTypes: z.array(z.string()).default([]) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile(); if (context instanceof NextResponse) return context;
  const { id } = await params; const body = bodySchema.parse(await request.json());
  if (!body.path.startsWith(`${context.profile.id}/${id}/`)) return NextResponse.json({ error: "Invalid document storage path." }, { status: 422 });
  const { data: document, error } = await context.supabase.from("valuation_documents").insert({ valuation_id: id, kind: body.kind, storage_path: body.path, original_filename: body.filename, mime_type: body.mimeType, byte_size: body.byteSize, sha256: body.sha256, other_document_types: body.otherDocumentTypes }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "DOCUMENT_UPLOADED", payload: { documentId: document.id, kind: body.kind } });
  try {
    const admin = createSupabaseAdminClient();
    const { data: file, error: downloadError } = await admin.storage.from("valuation-documents").download(body.path);
    if (downloadError || !file) throw new Error(downloadError?.message || "Unable to read the uploaded document.");
    const ocrText = await extractDocumentText({ bytes: Buffer.from(await file.arrayBuffer()), filename: body.filename, mimeType: body.mimeType });
    const completedAt = new Date().toISOString();
    const { error: updateError } = await context.supabase.from("valuation_documents").update({
      ocr_text: ocrText,
      ocr_completed_at: completedAt,
      processing_metadata: { ocrStatus: "COMPLETE", ocrProvider: "openai-responses", mode: "synchronous" },
    }).eq("id", document.id);
    if (updateError) throw new Error(updateError.message);
    await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "DOCUMENT_OCR_COMPLETED", payload: { documentId: document.id, provider: "openai-responses", mode: "synchronous" } });
    return NextResponse.json({ document: { ...document, ocr_text: ocrText, ocr_completed_at: completedAt }, processingStatus: "COMPLETE" }, { status: 201 });
  } catch (ocrError) {
    if (isAiCreditsExhausted(ocrError)) return NextResponse.json({ error: AI_CREDITS_EXHAUSTED_MESSAGE, code: "AI_CREDITS_EXHAUSTED" }, { status: 402 });
    const message = ocrError instanceof Error ? ocrError.message : "Document OCR failed.";
    await context.supabase.from("valuation_documents").update({ processing_metadata: { ocrStatus: "FAILED", mode: "synchronous", error: message } }).eq("id", document.id);
    await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "DOCUMENT_OCR_FAILED", payload: { documentId: document.id, mode: "synchronous" } });
    return NextResponse.json({ error: `Document uploaded, but extraction failed: ${message}` }, { status: 502 });
  }
}
