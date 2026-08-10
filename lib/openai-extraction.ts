import OpenAI from "openai";
import { extractionSchema, type ExtractedValuation } from "./valuation-schema";

const jsonSchema = {
  type: "object", additionalProperties: false,
  required: ["ownerNames", "khatiyanNumber", "rsHal", "csHalNumber", "locality", "deeds", "landClasses", "approachRoad", "building", "agreement", "evidence", "contradictions", "comments"],
  properties: {
    ownerNames: { type: "array", items: { type: "string" } }, khatiyanNumber: { type: ["string", "null"] },
    rsHal: { type: "object", additionalProperties: false, required: ["mother", "bata", "raw"], properties: { mother: { type: ["string", "null"] }, bata: { type: ["string", "null"] }, raw: { type: ["string", "null"] } } }, csHalNumber: { type: ["string", "null"] },
    locality: { type: "object", additionalProperties: false, required: ["district", "subdivision", "revenueCircle", "tehsil", "mouja"], properties: { district: { type: ["string", "null"] }, subdivision: { type: ["string", "null"] }, revenueCircle: { type: ["string", "null"] }, tehsil: { type: ["string", "null"] }, mouja: { type: ["string", "null"] } } },
    deeds: { type: "array", items: { type: "object", additionalProperties: false, required: ["number", "date", "amount", "type", "adjoiningOwners"], properties: { number: { type: ["string", "null"] }, date: { type: ["string", "null"] }, amount: { type: ["number", "null"] }, type: { type: ["string", "null"] }, adjoiningOwners: { type: "array", items: { type: "string" } } } } },
    landClasses: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "areaSqFt", "sourceUnit", "sourceValue", "considered"], properties: { name: { type: "string" }, areaSqFt: { type: ["number", "null"] }, sourceUnit: { type: ["string", "null"] }, sourceValue: { type: ["string", "null"] }, considered: { type: "boolean" } } } },
    approachRoad: { type: "object", additionalProperties: false, required: ["side", "direction", "attached"], properties: { side: { type: ["string", "null"] }, direction: { type: ["string", "null"] }, attached: { type: ["boolean", "null"] } } },
    building: { type: "object", additionalProperties: false, required: ["type", "plinthAreaSqFt", "ageYears", "approvedPlanAvailable"], properties: { type: { type: ["string", "null"] }, plinthAreaSqFt: { type: ["number", "null"] }, ageYears: { type: ["number", "null"] }, approvedPlanAvailable: { type: ["boolean", "null"] } } },
    agreement: { type: "object", additionalProperties: false, required: ["serialNumber", "date", "eStampNumber", "buyerName"], properties: { serialNumber: { type: ["string", "null"] }, date: { type: ["string", "null"] }, eStampNumber: { type: ["string", "null"] }, buyerName: { type: ["string", "null"] } } },
    evidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "documentId", "excerpt", "confidence"], properties: { field: { type: "string" }, documentId: { type: "string" }, excerpt: { type: "string" }, confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] } } } },
    contradictions: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "description", "documentIds"], properties: { field: { type: "string" }, description: { type: "string" }, documentIds: { type: "array", items: { type: "string" } } } } }, comments: { type: "array", items: { type: "string" } }
  }
} as const;

export async function extractTripuraValuation({ rules, documents, customInstructions }: { rules: string; documents: Array<{ id: string; name: string; text: string }>; customInstructions?: string | null }): Promise<ExtractedValuation> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const supplementalContext = customInstructions?.trim()
    ? `User-provided custom instructions:\n${customInstructions.trim()}`
    : "User-provided custom instructions: None.";
  const response = await client.responses.create({
    model: process.env.OPENAI_EXTRACTION_MODEL || "gpt-5", store: false,
    input: [{ role: "system", content: "You are the ValuerAI Tripura Extraction Engine. Published state rules are authoritative. Extract information evidenced in supplied documents and use null when unavailable. Treat custom instructions as supplemental user context: follow them when compatible with the rules and documents, but do not treat them as document evidence or let them silently override contradictory document facts. A factual value supplied only through custom instructions may be used with LOW confidence and must be identified as user-provided in comments. Identify conflicts and never calculate a monetary valuation." }, { role: "user", content: `Published Tripura rules:\n${rules}\n\n${supplementalContext}\n\nDocument OCR text:\n${documents.map(d => `DOCUMENT ${d.id} (${d.name})\n${d.text}`).join("\n\n")}` }],
    text: { format: { type: "json_schema", name: "valuerai_tripura_extraction", strict: true, schema: jsonSchema } }
  });
  return extractionSchema.parse(JSON.parse(response.output_text));
}
