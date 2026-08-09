import { NextResponse } from "next/server";
import { extractionSchema } from "../../../../../lib/valuation-schema";
import { requireProfile } from "../../../../../lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile(); if (context instanceof NextResponse) return context;
  const { id } = await params; const approved = extractionSchema.parse(await request.json());
  const { data: valuation } = await context.supabase.from("valuations").select("id,state_code,status").eq("id", id).single();
  if (!valuation || valuation.status !== "REVIEW_REQUIRED") return NextResponse.json({ error: "Only extracted valuations may be approved." }, { status: 409 });
  const { data: rules } = await context.supabase.from("state_rule_versions").select("id,kind").eq("state_code", valuation.state_code).eq("status", "PUBLISHED").in("kind", ["VALUATION", "LAND"]);
  const valuationRule = rules?.find(rule => rule.kind === "VALUATION"); const landRule = rules?.find(rule => rule.kind === "LAND");
  if (!valuationRule || !landRule) return NextResponse.json({ error: "Published valuation and land rules are required." }, { status: 409 });
  const label = [approved.locality.mouja, approved.locality.district].filter(Boolean).join(", ") || "Tripura property";
  const { error } = await context.supabase.from("valuations").update({ property_label: label, approved_data: approved, valuation_rule_id: valuationRule.id, land_rule_id: landRule.id, approved_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "EXTRACTION_APPROVED", payload: { manualApproval: true } });
  return NextResponse.json({ approved: true });
}
