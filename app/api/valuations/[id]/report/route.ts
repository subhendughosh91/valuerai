import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { requireProfile } from "../../../../../lib/auth";
import { createSbiStyleValuationReport } from "../../../../../lib/word-report";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile(); if (context instanceof NextResponse) return context;
  const { id } = await params; const { data: valuation } = await context.supabase.from("valuations").select("id,reference_no,status,approved_data,user_id,valuation_calculations(output)").eq("id", id).single();
  if (!valuation || valuation.status !== "COMPLETE" || !valuation.approved_data || !valuation.valuation_calculations?.[0]?.output) return NextResponse.json({ error: "Complete a valuation before generating its report." }, { status: 409 });
  const buffer = await createSbiStyleValuationReport({ referenceNo: valuation.reference_no, userName: context.profile.display_name, approved: valuation.approved_data, calculation: valuation.valuation_calculations[0].output });
  const path = `${valuation.user_id}/${id}/${valuation.reference_no}.docx`; const admin = createSupabaseAdminClient();
  const { error: uploadError } = await admin.storage.from("valuation-reports").upload(path, buffer, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", upsert: true });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 502 });
  const { data: report, error } = await admin.from("reports").upsert({ valuation_id: id, storage_path: path, generated_by: context.profile.id }, { onConflict: "storage_path" }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "REPORT_GENERATED", payload: { reportId: report.id } });
  const { data: signed, error: signedError } = await admin.storage.from("valuation-reports").createSignedUrl(path, 300);
  if (signedError) return NextResponse.json({ error: signedError.message }, { status: 502 });
  return NextResponse.json({ report, downloadUrl: signed.signedUrl, expiresInSeconds: 300 });
}
