import { NextResponse } from "next/server";
import { requireProfile } from "../../../../../lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile();
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const searchParams = new URL(request.url).searchParams;
  const discard = searchParams.get("discard") === "true";
  const preserveDocuments = searchParams.get("preserveDocuments") === "true";
  const { data: valuation } = await context.supabase.from("valuations").select("id,status").eq("id", id).single();
  if (!valuation || valuation.status === "COMPLETE") return NextResponse.json({ error: "Completed valuations cannot be reset." }, { status: 409 });

  if (preserveDocuments) {
    if (!["EXTRACTING", "UPLOADING"].includes(valuation.status)) {
      return NextResponse.json({ error: "Extraction cannot be cancelled at the current valuation stage." }, { status: 409 });
    }

    const completedAt = new Date().toISOString();
    const { error: runsError } = await context.supabase.from("extraction_runs").update({
      status: "FAILED",
      error: "Extraction cancelled by the user.",
      completed_at: completedAt,
    }).eq("valuation_id", id).eq("status", "RUNNING");
    if (runsError) return NextResponse.json({ error: runsError.message }, { status: 400 });

    const { data: retainedDocuments, error: retainedDocumentsError } = await context.supabase
      .from("valuation_documents")
      .select("id,ocr_text,processing_metadata")
      .eq("valuation_id", id);
    if (retainedDocumentsError) return NextResponse.json({ error: retainedDocumentsError.message }, { status: 400 });

    for (const document of retainedDocuments || []) {
      if (document.processing_metadata?.ocrStatus !== "RUNNING") continue;
      const { error: metadataError } = await context.supabase.from("valuation_documents").update({
        processing_metadata: {
          ...document.processing_metadata,
          ocrStatus: document.ocr_text ? "COMPLETE" : "PENDING",
        },
      }).eq("id", document.id);
      if (metadataError) return NextResponse.json({ error: metadataError.message }, { status: 400 });
    }

    const { error: cancelError } = await context.supabase.from("valuations").update({
      status: "UPLOADING",
      extraction_data: {},
      approved_data: null,
      extraction_rule_id: null,
      valuation_rule_id: null,
      land_rule_id: null,
      approved_at: null,
      processing_error: null,
    }).eq("id", id);
    if (cancelError) return NextResponse.json({ error: cancelError.message }, { status: 400 });

    await context.supabase.from("audit_events").insert({
      actor_id: context.profile.id,
      valuation_id: id,
      event_type: "EXTRACTION_CANCELLED",
      payload: { documentsRetained: true },
    });
    return NextResponse.json({ cancelled: true, documentsRetained: true });
  }

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
    status: discard ? "DISCARDED" : "UPLOADING", extraction_data: {}, approved_data: null, extraction_rule_id: null, valuation_rule_id: null, land_rule_id: null, approved_at: null, discarded_at: discard ? new Date().toISOString() : null, processing_error: null,
  }).eq("id", id);
  if (resetError) return NextResponse.json({ error: resetError.message }, { status: 400 });
  await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: discard ? "VALUATION_CANCELLED" : "VALUATION_DOCUMENTS_RESET" });
  return NextResponse.json({ reset: !discard, discarded: discard });
}
