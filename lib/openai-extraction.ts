import OpenAI from "openai";
import { extractionJsonSchema, extractionSchema, normalizeExtractionResult, type MinimumExtractionResult } from "./extraction-contract";
import { getExtractionModel } from "./openai-models";

export async function extractTripuraValuation({ rules, documents, customInstructions }: {
  rules: string;
  documents: Array<{ id: string; kind: string; name: string; text: string }>;
  customInstructions?: string | null;
}): Promise<MinimumExtractionResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  const supplementalContext = customInstructions?.trim()
    ? `User-provided custom instructions:\n${customInstructions.trim()}`
    : "User-provided custom instructions: None.";
  const response = await client.responses.create({
    model: getExtractionModel(),
    reasoning: { effort: "low" },
    store: false,
    input: [
      {
        role: "system",
        content: `You are the ValuerAI document Extraction Engine. Return the complete structured extraction contract supplied in the response schema.

Rules:
- Attempt every field in every group, irrespective of which document types are supplied.
- Consider every field allowed by each schema group. Return one group-array entry for every field with a source-backed value, alternative value, or meaningful extraction remark. The application will create null entries for every unreturned field so the complete editable form is always displayed. Never guess.
- Preserve deed numbers, Khatiyan numbers, plot numbers, certificate numbers, agreement numbers, and dates exactly as written.
- For a non-null value, record the source document using its supplied document kind and filename, the page or section when available, confidence, and concise remarks.
- If documents contain conflicting values, select the best-supported value as the primary value, put every other source-backed value in alternative_values, and add a validation warning. Do not silently reconcile conflicts.
- Normalise areas to square feet when the applicable published land rule gives a supported conversion, while preserving each original value and unit in the appropriate fields.
- Populate source_trace for every non-null primary or alternative value. Source trace and field provenance must refer to supplied documents, not to the model.
- List report-critical unavailable fields in missing_required_fields. At minimum check land owner name, deed number and date, Khatiyan number, RS/Hal plot number, CS/Sebek Dag number, land classification and areas, property location, boundaries, and approach road.
- Fields under calculated_inputs_ready_for_valuation are inputs or placeholders only. Copy a directly evidenced rate or value where appropriate, but do not calculate property values, depreciation, realisable value, distress value, or other monetary outputs.
- Custom instructions are supplemental context. They cannot override documentary evidence or published rules. A factual value supplied only through custom instructions may be used with LOW confidence, must identify the source as \"User custom instruction\", and must include a clarification remark.
- Photographs are supporting evidence only and must not be used to infer legal ownership.`,
      },
      {
        role: "user",
        content: `Published state extraction and land instructions:\n${rules}\n\n${supplementalContext}\n\nDocument OCR text:\n${documents.map((document) => `DOCUMENT ID: ${document.id}\nDOCUMENT TYPE: ${document.kind}\nFILENAME: ${document.name}\n${document.text}`).join("\n\n")}`,
      },
    ],
    text: { format: { type: "json_schema", name: "valuerai_minimum_source_document_extraction", strict: true, schema: extractionJsonSchema } },
  });
  return extractionSchema.parse(normalizeExtractionResult(JSON.parse(response.output_text)));
}
