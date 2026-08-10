import OpenAI from "openai";
import { after, NextResponse } from "next/server";
import { advanceBackgroundExtractionByResponseId } from "../../../../lib/openai-background-extraction";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

export const maxDuration = 120;

export async function POST(request: Request) {
  const secret = process.env.OPENAI_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "OpenAI webhook verification is not configured." }, { status: 503 });

  const payload = await request.text();
  let event: Awaited<ReturnType<OpenAI["webhooks"]["unwrap"]>>;
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    event = await client.webhooks.unwrap(payload, request.headers, secret);
  } catch (error) {
    console.warn("[openai-webhook] signature verification failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const webhookId = request.headers.get("webhook-id")?.trim();
  if (!webhookId) return NextResponse.json({ error: "Missing webhook-id header." }, { status: 400 });
  const responseId = "data" in event && event.data && "id" in event.data ? String(event.data.id) : null;
  const admin = createSupabaseAdminClient();
  const { error: insertError } = await admin.from("openai_webhook_events").insert({
    webhook_id: webhookId,
    event_id: event.id,
    event_type: event.type,
    response_id: responseId,
    payload: event,
  });
  if (insertError) {
    if (insertError.code === "23505") return NextResponse.json({ accepted: true, duplicate: true });
    console.error("[openai-webhook] event persistence failed", { webhookId, eventId: event.id, error: insertError.message });
    return NextResponse.json({ error: "Webhook event could not be recorded." }, { status: 500 });
  }

  after(async () => {
    try {
      if (responseId && event.type.startsWith("response.")) await advanceBackgroundExtractionByResponseId(responseId);
      await admin.from("openai_webhook_events").update({ processed_at: new Date().toISOString(), processing_error: null }).eq("webhook_id", webhookId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook completion processing failed.";
      console.error("[openai-webhook] completion processing failed", { webhookId, eventId: event.id, responseId, error: message });
      await admin.from("openai_webhook_events").update({ processing_error: message }).eq("webhook_id", webhookId);
    }
  });

  return NextResponse.json({ accepted: true });
}
