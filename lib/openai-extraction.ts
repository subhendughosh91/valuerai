import OpenAI from "openai";
import { extractionJsonSchema, extractionSchema, normalizeExtractionResult, type MinimumExtractionResult } from "./extraction-contract";
import { getExtractionModel, getExtractionReasoningEffort, type ConfiguredReasoningEffort } from "./openai-models";

type ExtractionRequest = {
  rules: string;
  documents: Array<{ id: string; kind: string; name: string; text: string }>;
  customInstructions?: string | null;
};

export function buildStructuredExtractionRequest(
  { rules, documents, customInstructions }: ExtractionRequest,
  options?: { background?: boolean; model?: string; reasoningEffort?: ConfiguredReasoningEffort },
) {
  const supplementalContext = customInstructions?.trim()
    ? `User-provided custom instructions:\n${customInstructions.trim()}`
    : "User-provided custom instructions: None.";

  return {
    model: options?.model || getExtractionModel(),
    reasoning: { effort: options?.reasoningEffort || getExtractionReasoningEffort() },
    background: options?.background || false,
    store: false,
    input: [
      {
        role: "system" as const,
        content: `You are the ValuerAI document Extraction Engine. Return the complete structured extraction contract supplied in the response schema.

Rules:
- Attempt every field in every group, irrespective of which document types are supplied.
- Consider every field allowed by each schema group. Return one group-array entry for every field with a source-backed value, alternative value, or meaningful extraction remark. The application will create null entries for every unreturned field so the complete editable form is always displayed. Never guess.
- Return every user-facing field value, alternative value, validation warning, missing-field description, and remark in professional English using the Latin alphabet.
- For Bengali source text, translate descriptive content into English and transliterate proper nouns such as personal names, locality names, Mouja names, Tehsil names, Revenue Circle names, and police-station names into the Latin alphabet. Proper nouns must be transliterated, not semantically translated.
- Prefer an English spelling explicitly evidenced in KYC or another uploaded document. If documents contain materially different English spellings, retain the best-supported spelling as the primary value, preserve the others in alternative_values, and add an English validation warning.
- Convert Bengali numerals to Arabic numerals 0-9. Preserve the complete sequence, ordering, slash structure, punctuation, and identifier components. Never infer, correct, combine, or renumber deed numbers, Khatiyan numbers, plot numbers, CS/Sebek or RS/Hal mother/bata numbers, certificate numbers, agreement numbers, or dates.
- Express Bengali land and area terminology in its recognised English or Roman-script form, including Satak, Ganda, Kani, Acre, square feet, Bastu, Bhiti, and Tilla, without changing the source meaning or value.
- When a translation or transliteration is uncertain or legally significant, include the original Bengali text in remarks using "Original Bengali text: ...", assign LOW confidence, and add an English clarification warning. Never guess an unreadable word or spelling.
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
        role: "user" as const,
        content: `Published state extraction and land instructions:\n${rules}\n\n${supplementalContext}\n\nDocument OCR text:\n${documents.map((document) => `DOCUMENT ID: ${document.id}\nDOCUMENT TYPE: ${document.kind}\nFILENAME: ${document.name}\n${document.text}`).join("\n\n")}`,
      },
    ],
    text: { format: { type: "json_schema" as const, name: "valuerai_minimum_source_document_extraction", strict: true, schema: extractionJsonSchema } },
  };
}

export function parseStructuredExtractionResponse(response: { output_text: string }): MinimumExtractionResult {
  if (!response.output_text.trim()) throw new Error("Structured extraction returned no data.");
  return extractionSchema.parse(normalizeExtractionResult(JSON.parse(response.output_text)));
}

export async function extractTripuraValuation(request: ExtractionRequest): Promise<MinimumExtractionResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  const response = await client.responses.create(buildStructuredExtractionRequest(request));
  return parseStructuredExtractionResponse(response);
}
