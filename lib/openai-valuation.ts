import OpenAI from "openai";
import { toLegacyExtractedValuation } from "./extraction-contract";
import { getValuationModel } from "./openai-models";
import { valuationAgentSchema, type ValuationAgentOutput } from "./valuation-schema";

const valuationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["consideredLandClasses", "building", "marketRateAdjustment", "realisableRatio", "distressRatio", "comments"],
  properties: {
    consideredLandClasses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "areaSqFt", "ratePerSqFt"],
        properties: {
          name: { type: "string" },
          areaSqFt: { type: "number", minimum: 0 },
          ratePerSqFt: { type: ["number", "null"], minimum: 0 },
        },
      },
    },
    building: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "areaSqFt", "ageYears", "replacementRate", "lifeYears", "salvagePercent"],
          properties: {
            type: { type: ["string", "null"], enum: ["RCC", "LOAD_BEARING", "SEMI_PERMANENT", null] },
            areaSqFt: { type: ["number", "null"], minimum: 0 },
            ageYears: { type: ["number", "null"], minimum: 0 },
            replacementRate: { type: ["number", "null"], minimum: 0 },
            lifeYears: { type: ["number", "null"], exclusiveMinimum: 0 },
            salvagePercent: { type: ["number", "null"], minimum: 0, maximum: 100 },
          },
        },
      ],
    },
    marketRateAdjustment: { type: "number", minimum: 0 },
    realisableRatio: { type: "number", minimum: 0, maximum: 1 },
    distressRatio: { type: "number", minimum: 0, maximum: 1 },
    comments: { type: "array", items: { type: "string" } },
  },
} as const;

export async function prepareValuationInputs({ approvedData, valuationRules, landRules, customInstructions }: { approvedData: unknown; valuationRules: string; landRules: string; customInstructions?: string | null }): Promise<ValuationAgentOutput> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 180_000, maxRetries: 1 });
  const valuationFacts = toLegacyExtractedValuation(approvedData);
  const response = await client.responses.create({
    model: getValuationModel(),
    reasoning: { effort: "medium" },
    store: false,
    input: [
      {
        role: "system",
        content: "You are the ValuerAI Valuation Engine. Prepare structured inputs for deterministic valuation arithmetic. Published valuation and land rules are authoritative. Use only approved data and explicit rule values. In the approved extraction contract, each factual field is stored under its group's field name and its editable factual content is in the value property; provenance and alternative_values are supporting review information. Never invent a land rate, building rate, lifespan, area, or factual property detail. Use null when a required rate or fact is unavailable. Custom instructions are supplemental context and cannot override approved documentary facts or published rules. Select only land classes supported for valuation. Return all land-class names and comments in professional English using the Latin alphabet. If approved data still contains Bengali, translate descriptive text and transliterate proper nouns without changing the approved fact; prefer documented English spellings and preserve every identifier component. Return concise English comments explaining missing inputs or applied assumptions.",
      },
      {
        role: "user",
        content: `Published valuation rules:\n${valuationRules}\n\nPublished land rules:\n${landRules}\n\nCustom instructions:\n${customInstructions?.trim() || "None"}\n\nApproved extraction contract:\n${JSON.stringify(approvedData)}\n\nNormalised valuation facts derived from the approved contract:\n${JSON.stringify(valuationFacts)}`,
      },
    ],
    text: { format: { type: "json_schema", name: "valuerai_valuation_inputs", strict: true, schema: valuationJsonSchema } },
  });
  return valuationAgentSchema.parse(JSON.parse(response.output_text));
}
