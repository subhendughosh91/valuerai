import { NextResponse } from "next/server";
import { requireProfile } from "../../../../lib/auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile();
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data, error } = await context.supabase
    .from("valuations")
    .select("id,reference_no,property_label,status,state_code,extraction_data,approved_data,processing_error,created_at,updated_at,valuation_documents(id,kind,original_filename,mime_type,byte_size,ocr_text,ocr_completed_at,processing_metadata),valuation_calculations(id,output,created_at),reports(id,storage_path,created_at)")
    .eq("id", id)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Valuation not found." }, { status: 404 });
  return NextResponse.json({ valuation: data });
}
