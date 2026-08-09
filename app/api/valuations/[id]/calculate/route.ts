import { NextResponse } from "next/server";
import { requireProfile } from "../../../../../lib/auth";
import { calculateTripuraValuation } from "../../../../../lib/calculations";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile(); if (context instanceof NextResponse) return context;
  const { id } = await params; const { data: valuation } = await context.supabase.from("valuations").select("id,status,approved_data").eq("id", id).single();
  if (!valuation || valuation.status !== "REVIEW_REQUIRED") return NextResponse.json({ error: "Confirm extracted data before valuation." }, { status: 409 });
  const output = calculateTripuraValuation(await request.json());
  const { data, error } = await context.supabase.from("valuation_calculations").upsert({ valuation_id: id, input_snapshot: valuation.approved_data ?? {}, output }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await context.supabase.from("valuations").update({ status: "COMPLETE" }).eq("id", id);
  await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "VALUATION_CALCULATED", payload: { calculationId: data.id } });
  return NextResponse.json({ calculation: data });
}
