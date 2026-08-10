import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProfile } from "../../../../lib/auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile();
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data, error } = await context.supabase
    .from("valuations")
    .select("id,reference_no,property_label,custom_instructions,status,state_code,extraction_data,approved_data,processing_error,created_at,updated_at,valuation_documents(id,kind,original_filename,mime_type,byte_size,ocr_text,ocr_completed_at,processing_metadata),valuation_calculations(id,output,created_at),reports(id,storage_path,created_at)")
    .eq("id", id)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Valuation not found." }, { status: 404 });
  return NextResponse.json({ valuation: data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile();
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const parsed = z.object({ customInstructions: z.string().max(4000) }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Custom instructions must not exceed 4,000 characters." }, { status: 422 });

  const { data: valuation } = await context.supabase.from("valuations").select("id,status").eq("id", id).single();
  if (!valuation) return NextResponse.json({ error: "Valuation not found." }, { status: 404 });
  if (!["DRAFT", "UPLOADING"].includes(valuation.status)) return NextResponse.json({ error: "Custom instructions can no longer be changed after extraction has started." }, { status: 409 });

  const customInstructions = parsed.data.customInstructions.trim() || null;
  const { error } = await context.supabase.from("valuations").update({ custom_instructions: customInstructions }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "CUSTOM_INSTRUCTIONS_UPDATED", payload: { provided: Boolean(customInstructions) } });
  return NextResponse.json({ customInstructions });
}
