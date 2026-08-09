import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireProfile } from "../../../../../../lib/auth";
import { documentKinds } from "../../../../../../lib/valuation-schema";

const bodySchema = z.object({ kind: z.enum(documentKinds), filename: z.string().min(1).max(255), mimeType: z.enum(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "image/webp"]), byteSize: z.number().int().positive().max(26214400), otherDocumentTypes: z.array(z.string().min(1).max(80)).max(20).default([]) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile(); if (context instanceof NextResponse) return context;
  const { id } = await params; const body = bodySchema.parse(await request.json());
  const { data: valuation } = await context.supabase.from("valuations").select("id,status").eq("id", id).single();
  if (!valuation || !["DRAFT", "UPLOADING"].includes(valuation.status)) return NextResponse.json({ error: "This valuation cannot accept documents." }, { status: 409 });
  if (body.kind !== "OTHER" && body.otherDocumentTypes.length) return NextResponse.json({ error: "Other document names are only permitted for OTHER documents." }, { status: 422 });
  const extension = body.filename.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
  const path = `${context.profile.id}/${id}/${randomUUID()}.${extension}`;
  const { data, error } = await context.supabase.storage.from("valuation-documents").createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl, expiresInSeconds: 120 });
}
