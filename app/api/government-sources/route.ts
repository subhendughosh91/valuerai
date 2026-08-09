import { NextResponse } from "next/server";
import { tripuraGovernmentSources } from "../../../lib/government-sources";
import { requireProfile } from "../../../lib/auth";

export async function GET() {
  const context = await requireProfile(); if (context instanceof NextResponse) return context;
  return NextResponse.json({ stateCode: context.profile.state_code, sources: context.profile.state_code === "TR" ? tripuraGovernmentSources : [] });
}
