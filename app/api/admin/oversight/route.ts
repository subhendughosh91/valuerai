import { NextResponse } from "next/server";
import { requireProfile } from "../../../../lib/auth";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

export async function GET(request: Request) {
  const context = await requireProfile(true); if (context instanceof NextResponse) return context;
  const stateCode = new URL(request.url).searchParams.get("stateCode") || "TR";
  const { data: users, error: usersError } = await context.supabase.from("profiles").select("id,display_name,phone,address,state_code,country,created_at,role").eq("state_code", stateCode).order("created_at", { ascending: false });
  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 400 });
  const { data: authUsers, error: authError } = await createSupabaseAdminClient().auth.admin.listUsers({ perPage: 1000 });
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });
  const { data: valuations, error: valuationError } = await context.supabase.from("valuations").select("id,reference_no,property_label,status,state_code,user_id,created_at,updated_at").eq("state_code", stateCode).order("updated_at", { ascending: false });
  if (valuationError) return NextResponse.json({ error: valuationError.message }, { status: 400 });
  return NextResponse.json({ users: (users || []).map((user) => ({ ...user, email: authUsers.users.find((authUser) => authUser.id === user.id)?.email || "N/A" })), valuations });
}
