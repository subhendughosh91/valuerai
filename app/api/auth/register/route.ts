import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

const registration = z.object({ displayName: z.string().min(2).max(120), email: z.string().email(), password: z.string().min(12).max(128), phone: z.string().max(30).optional(), address: z.string().min(5).max(500), stateCode: z.string() });
export async function POST(request: Request) {
  const body = registration.parse(await request.json());
  if (body.stateCode !== "TR") return NextResponse.json({ error: "ValuerAI is currently work in progress for this state." }, { status: 409 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email: body.email, password: body.password, options: { emailRedirectTo: `${process.env.APP_URL}/auth/callback`, data: { display_name: body.displayName, phone: body.phone ?? "", address: body.address, state_code: body.stateCode } } });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ userId: data.user?.id, requiresEmailConfirmation: !data.session }, { status: 201 });
}
