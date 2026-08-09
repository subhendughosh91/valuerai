import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ service: "ValuerAI", status: "ok", jurisdiction: "Tripura", mode: "prototype" });
}
