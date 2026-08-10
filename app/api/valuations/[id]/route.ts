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

  // A synchronous extraction invocation can be terminated by the hosting
  // platform before its catch block runs. Recover runs that have exceeded the
  // extraction route's maximum duration so the user is not left permanently
  // on an EXTRACTING screen. Uploaded files and completed OCR text are retained.
  if (data.status === "EXTRACTING") {
    const { data: latestRun } = await context.supabase
      .from("extraction_runs")
      .select("id,status,started_at")
      .eq("valuation_id", id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const startedAt = latestRun?.started_at ? Date.parse(latestRun.started_at) : 0;
    const stale = !latestRun || latestRun.status === "FAILED" || !startedAt || Date.now() - startedAt > 360_000;
    if (stale) {
      if (latestRun?.status === "RUNNING") {
        await context.supabase.from("extraction_runs").update({
          status: "FAILED",
          error: "Extraction exceeded the hosting time limit.",
          completed_at: new Date().toISOString(),
        }).eq("id", latestRun.id);
      }
      const recoveryMessage = "The previous AI extraction was interrupted by a server timeout. Your uploaded documents have been retained; select Start Valuation to retry.";
      await context.supabase.from("valuations").update({ status: "UPLOADING", processing_error: recoveryMessage }).eq("id", id);
      data.status = "UPLOADING";
      data.processing_error = recoveryMessage;
    }
  }
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
