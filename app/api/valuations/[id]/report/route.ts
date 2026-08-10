import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { requireProfile } from "../../../../../lib/auth";
import { createSbiStyleValuationReport } from "../../../../../lib/word-report";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile();
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data: valuation } = await context.supabase.from("valuations").select("id,reference_no,reports(storage_path,created_at)").eq("id", id).single();
  const latestReport = valuation?.reports?.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  if (!valuation || !latestReport) return NextResponse.json({ error: "No generated report is available for this valuation." }, { status: 404 });
  const admin = createSupabaseAdminClient();
  const { data: signed, error } = await admin.storage.from("valuation-reports").createSignedUrl(latestReport.storage_path, 300, { download: `${valuation.reference_no}.docx` });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "REPORT_DOWNLOADED" });
  return NextResponse.redirect(signed.signedUrl);
}

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
  const { data: signed, error: signedError } = await admin.storage.from("valuation-reports").createSignedUrl(path, 300, { download: `${valuation.reference_no}.docx` });
  if (signedError) return NextResponse.json({ error: signedError.message }, { status: 502 });
  return NextResponse.json({ report, downloadUrl: signed.signedUrl, expiresInSeconds: 300 });
}
