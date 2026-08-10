import { NextResponse } from "next/server";
import { requireProfile } from "../../../../../../lib/auth";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const context = await requireProfile();
  if (context instanceof NextResponse) return context;
  const { id, documentId } = await params;

  const { data: valuation } = await context.supabase.from("valuations").select("id,status").eq("id", id).single();
  if (!valuation || !["DRAFT", "UPLOADING"].includes(valuation.status)) {
    return NextResponse.json({ error: "Documents cannot be removed after valuation processing has started." }, { status: 409 });
  }

  const { data: document, error: documentError } = await context.supabase
    .from("valuation_documents")
    .select("id,storage_path,original_filename")
    .eq("id", documentId)
    .eq("valuation_id", id)
    .single();
  if (documentError || !document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const { error: storageError } = await context.supabase.storage.from("valuation-documents").remove([document.storage_path]);
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 502 });

  const { error: deleteError } = await context.supabase.from("valuation_documents").delete().eq("id", documentId).eq("valuation_id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

  await context.supabase.from("audit_events").insert({
    actor_id: context.profile.id,
    valuation_id: id,
    event_type: "DOCUMENT_REMOVED",
    payload: { documentId, filename: document.original_filename },
  });
  return NextResponse.json({ removed: true });
}
