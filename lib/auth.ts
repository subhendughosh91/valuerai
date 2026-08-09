import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "./supabase/server";

export type AppProfile = { id: string; role: "USER" | "ADMIN"; display_name: string; state_code: string };

export async function requireProfile(adminOnly = false): Promise<{ profile: AppProfile; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> } | NextResponse> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("id,role,display_name,state_code").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 403 });
  if (adminOnly && profile.role !== "ADMIN") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  return { profile: profile as AppProfile, supabase };
}
