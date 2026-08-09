import { NextResponse } from "next/server";
import { requireProfile } from "../../../../../lib/auth";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile();
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data: valuation } = await context.supabase.from("valuations").select("id,status").eq("id", id).single();
  if (!valuation || valuation.status === "COMPLETE") return NextResponse.json({ error: "Completed valuations cannot be reset." }, { status: 409 });

  const { data: documents, error: documentsError } = await context.supabase.from("valuation_documents").select("storage_path").eq("valuation_id", id);
  if (documentsError) return NextResponse.json({ error: documentsError.message }, { status: 400 });
  if (documents?.length) {
    const { error: storageError } = await context.supabase.storage.from("valuation-documents").remove(documents.map((document) => document.storage_path));
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 502 });
  }
  const { error: deleteError } = await context.supabase.from("valuation_documents").delete().eq("valuation_id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
  await context.supabase.from("extraction_runs").delete().eq("valuation_id", id);
  await context.supabase.from("valuation_calculations").delete().eq("valuation_id", id);
  const { error: resetError } = await context.supabase.from("valuations").update({
    status: "UPLOADING", property_label: null, extraction_data: {}, approved_data: null, extraction_rule_id: null, valuation_rule_id: null, land_rule_id: null, approved_at: null, processing_error: null,
  }).eq("id", id);
  if (resetError) return NextResponse.json({ error: resetError.message }, { status: 400 });
  await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "VALUATION_DOCUMENTS_RESET" });
  return NextResponse.json({ reset: true });
}
