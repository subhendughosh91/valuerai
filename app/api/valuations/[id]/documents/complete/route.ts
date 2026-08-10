import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProfile } from "../../../../../../lib/auth";
import { documentKinds } from "../../../../../../lib/valuation-schema";

const bodySchema = z.object({ kind: z.enum(documentKinds), path: z.string().min(1), filename: z.string().min(1), mimeType: z.string().min(1), byteSize: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(), otherDocumentTypes: z.array(z.string()).default([]) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile(); if (context instanceof NextResponse) return context;
  const { id } = await params; const body = bodySchema.parse(await request.json());
  if (!body.path.startsWith(`${context.profile.id}/${id}/`)) return NextResponse.json({ error: "Invalid document storage path." }, { status: 422 });
  const { data: document, error } = await context.supabase.from("valuation_documents").insert({
    valuation_id: id,
    kind: body.kind,
    storage_path: body.path,
    original_filename: body.filename,
    mime_type: body.mimeType,
    byte_size: body.byteSize,
    sha256: body.sha256,
    other_document_types: body.otherDocumentTypes,
    processing_metadata: { ocrStatus: "NOT_STARTED", mode: "on-start-valuation" },
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "DOCUMENT_UPLOADED", payload: { documentId: document.id, kind: body.kind } });
  return NextResponse.json({ document, processingStatus: "UPLOADED" }, { status: 201 });
}
