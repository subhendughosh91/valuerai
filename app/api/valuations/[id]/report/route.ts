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
  const context = await requireProfile();
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data: valuation, error: valuationError } = await context.supabase
    .from("valuations")
    .select("id,reference_no,status,approved_data,user_id")
    .eq("id", id)
    .single();
  if (valuationError || !valuation) return NextResponse.json({ error: "Valuation not found." }, { status: 404 });
  if (valuation.status !== "COMPLETE") return NextResponse.json({ error: "Complete the valuation before generating its report." }, { status: 409 });
  if (!valuation.approved_data || !Object.keys(valuation.approved_data).length) return NextResponse.json({ error: "Approved valuation data is unavailable." }, { status: 409 });

  // valuation_id is unique, so PostgREST exposes this as a one-to-one relation.
  // Query it directly to avoid treating the relation as an array.
  const { data: calculation, error: calculationError } = await context.supabase
    .from("valuation_calculations")
    .select("output")
    .eq("valuation_id", id)
    .maybeSingle();
  if (calculationError) {
    console.error("[valuation-report] calculation lookup failed", { valuationId: id, error: calculationError.message });
    return NextResponse.json({ error: "The saved valuation calculation could not be loaded." }, { status: 500 });
  }
  if (!calculation?.output || !Object.keys(calculation.output).length) return NextResponse.json({ error: "The completed valuation has no saved calculation result." }, { status: 409 });

  console.log("[valuation-report] generation started", { valuationId: id, referenceNo: valuation.reference_no });
  try {
    const buffer = await createSbiStyleValuationReport({ referenceNo: valuation.reference_no, userName: context.profile.display_name, approved: valuation.approved_data, calculation: calculation.output });
    const path = `${valuation.user_id}/${id}/${valuation.reference_no}.docx`;
    const admin = createSupabaseAdminClient();
    const { error: uploadError } = await admin.storage.from("valuation-reports").upload(path, buffer, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", upsert: true });
    if (uploadError) throw new Error(`Report upload failed: ${uploadError.message}`);
    const { data: report, error: reportError } = await admin.from("reports").upsert({ valuation_id: id, storage_path: path, generated_by: context.profile.id }, { onConflict: "storage_path" }).select().single();
    if (reportError) throw new Error(`Report record failed: ${reportError.message}`);
    await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "REPORT_GENERATED", payload: { reportId: report.id } });
    const { data: signed, error: signedError } = await admin.storage.from("valuation-reports").createSignedUrl(path, 300, { download: `${valuation.reference_no}.docx` });
    if (signedError) throw new Error(`Report link failed: ${signedError.message}`);
    console.log("[valuation-report] generation completed", { valuationId: id, reportId: report.id });
    return NextResponse.json({ report, downloadUrl: signed.signedUrl, expiresInSeconds: 300 });
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : "Unknown report-generation error";
    console.error("[valuation-report] generation failed", { valuationId: id, error: diagnostic });
    return NextResponse.json({ error: "The valuation document could not be generated. Please try again or contact the administrator." }, { status: 502 });
  }
}
