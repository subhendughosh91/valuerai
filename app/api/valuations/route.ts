import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProfile } from "../../../lib/auth";

export async function GET() {
  const context = await requireProfile(); if (context instanceof NextResponse) return context;
  const { data, error } = await context.supabase.from("valuations").select("id,reference_no,property_label,status,created_at,updated_at,reports(id)").neq("status", "DISCARDED").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ valuations: data });
}
export async function POST(request: Request) {
  const context = await requireProfile(); if (context instanceof NextResponse) return context;
  if (context.profile.role !== "USER" || context.profile.state_code !== "TR") return NextResponse.json({ error: "Valuation is not enabled for this state." }, { status: 409 });
  const body = z.object({ propertyLabel: z.string().trim().min(1).max(200) }).parse(await request.json());
  const { data, error } = await context.supabase.from("valuations").insert({ user_id: context.profile.id, state_code: "TR", status: "UPLOADING", property_label: body.propertyLabel }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: data.id, event_type: "VALUATION_CREATED" });
  return NextResponse.json({ valuation: data }, { status: 201 });
}
