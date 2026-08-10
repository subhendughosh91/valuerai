import { NextResponse } from "next/server";
import { requireProfile } from "../../../../../../lib/auth";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile();
  if (context instanceof NextResponse) return context;

  const { id } = await params;
  const { data: valuation } = await context.supabase.from("valuations").select("id,status").eq("id", id).single();
  if (!valuation || !["DRAFT", "UPLOADING"].includes(valuation.status)) {
    return NextResponse.json({ error: "This valuation cannot process documents." }, { status: 409 });
  }

  const { data: documents, error: documentsError } = await context.supabase
    .from("valuation_documents")
    .select("id,storage_path,original_filename,mime_type,ocr_text,processing_metadata")
    .eq("valuation_id", id);
  if (documentsError) return NextResponse.json({ error: documentsError.message }, { status: 400 });
  if (!documents?.length) return NextResponse.json({ error: "Upload at least one document before OCR." }, { status: 422 });

  return NextResponse.json({
    queued: [],
    completed: documents.filter((document) => Boolean(document.ocr_text)).map((document) => document.id),
    message: "Document text extraction starts synchronously when Start Valuation is selected.",
  });
}
