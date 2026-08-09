import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProfile } from "../../../../lib/auth";

const ruleSchema = z.object({ stateCode: z.literal("TR"), kind: z.enum(["EXTRACTION", "VALUATION", "LAND"]), content: z.string().min(50), publish: z.boolean().default(false) });
export async function GET() {
  const context = await requireProfile(true); if (context instanceof NextResponse) return context;
  const { data, error } = await context.supabase.from("state_rule_versions").select("*").eq("state_code", "TR").order("kind").order("version", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ rules: data });
}
export async function POST(request: Request) {
  const context = await requireProfile(true); if (context instanceof NextResponse) return context;
  const body = ruleSchema.parse(await request.json());
  const { data: current } = await context.supabase.from("state_rule_versions").select("version").eq("state_code", body.stateCode).eq("kind", body.kind).order("version", { ascending: false }).limit(1).maybeSingle();
  if (body.publish) await context.supabase.from("state_rule_versions").update({ status: "RETIRED" }).eq("state_code", body.stateCode).eq("kind", body.kind).eq("status", "PUBLISHED");
  const { data, error } = await context.supabase.from("state_rule_versions").insert({ state_code: body.stateCode, kind: body.kind, version: (current?.version ?? 0) + 1, content: body.content, status: body.publish ? "PUBLISHED" : "DRAFT", published_at: body.publish ? new Date().toISOString() : null, published_by: body.publish ? context.profile.id : null }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, event_type: body.publish ? "RULE_PUBLISHED" : "RULE_DRAFTED", payload: { ruleId: data.id, kind: body.kind } });
  return NextResponse.json({ rule: data }, { status: 201 });
}
