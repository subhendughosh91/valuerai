import { NextResponse } from "next/server";
import { calculateTripuraValuation } from "../../../../../lib/calculations";
import { AI_CREDITS_EXHAUSTED_MESSAGE, isAiCreditsExhausted } from "../../../../../lib/openai-errors";
import { prepareValuationInputs } from "../../../../../lib/openai-valuation";
import { requireProfile } from "../../../../../lib/auth";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile();
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data: valuation } = await context.supabase
    .from("valuations")
    .select("id,status,approved_data,custom_instructions,valuation_rule_id,land_rule_id")
    .eq("id", id)
    .single();
  if (!valuation || valuation.status !== "REVIEW_REQUIRED" || !valuation.approved_data) return NextResponse.json({ error: "Confirm extracted data before valuation." }, { status: 409 });
  if (!valuation.valuation_rule_id || !valuation.land_rule_id) return NextResponse.json({ error: "Published valuation and land rules are required." }, { status: 409 });

  const { data: rules, error: rulesError } = await context.supabase
    .from("state_rule_versions")
    .select("id,kind,content")
    .in("id", [valuation.valuation_rule_id, valuation.land_rule_id]);
  if (rulesError) return NextResponse.json({ error: rulesError.message }, { status: 400 });
  const valuationRules = rules?.find((rule) => rule.id === valuation.valuation_rule_id)?.content;
  const landRules = rules?.find((rule) => rule.id === valuation.land_rule_id)?.content;
  if (!valuationRules || !landRules) return NextResponse.json({ error: "The published rule snapshot could not be loaded." }, { status: 409 });

  const { error: statusError } = await context.supabase.from("valuations").update({ status: "VALUING", processing_error: null }).eq("id", id);
  if (statusError) return NextResponse.json({ error: "The valuation could not be started. Please try again." }, { status: 500 });
  let stage: "VALUATION_ENGINE" | "CALCULATION_SAVE" | "COMPLETION_SAVE" = "VALUATION_ENGINE";
  try {
    const valuationInput = await prepareValuationInputs({
      approvedData: valuation.approved_data,
      valuationRules,
      landRules,
      customInstructions: valuation.custom_instructions,
    });
    const deterministicOutput = calculateTripuraValuation(valuationInput);
    const output = { ...deterministicOutput, agentComments: valuationInput.comments };
    stage = "CALCULATION_SAVE";
    const { data, error } = await context.supabase.from("valuation_calculations").upsert({
      valuation_id: id,
      input_snapshot: {
        approvedData: valuation.approved_data,
        valuationInput,
        customInstructions: valuation.custom_instructions,
        valuationRuleId: valuation.valuation_rule_id,
        landRuleId: valuation.land_rule_id,
      },
      output,
    }).select().single();
    if (error) throw new Error(error.message);
    stage = "COMPLETION_SAVE";
    const { error: completionError } = await context.supabase.from("valuations").update({ status: "COMPLETE", processing_error: null }).eq("id", id);
    if (completionError) throw new Error(completionError.message);
    await context.supabase.from("audit_events").insert({ actor_id: context.profile.id, valuation_id: id, event_type: "VALUATION_CALCULATED", payload: { calculationId: data.id, customInstructionsProvided: Boolean(valuation.custom_instructions) } });
    return NextResponse.json({ calculation: data });
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : "Unknown valuation error";
    console.error("Valuation processing failed", { valuationId: id, stage, error: diagnostic });
    if (isAiCreditsExhausted(error)) {
      await context.supabase.from("valuations").update({ status: "REVIEW_REQUIRED", processing_error: AI_CREDITS_EXHAUSTED_MESSAGE }).eq("id", id);
      return NextResponse.json({ error: AI_CREDITS_EXHAUSTED_MESSAGE, code: "AI_CREDITS_EXHAUSTED" }, { status: 402 });
    }
    const message = stage === "VALUATION_ENGINE"
      ? "The Valuation Engine could not process the approved data. Review the data and try again."
      : stage === "CALCULATION_SAVE"
        ? "The valuation result could not be saved. Please try again or contact the administrator."
        : "The valuation completed, but its final status could not be saved. Please try again.";
    await context.supabase.from("valuations").update({ status: "REVIEW_REQUIRED", processing_error: message }).eq("id", id);
    return NextResponse.json({ error: message, stage }, { status: 502 });
  }
}
