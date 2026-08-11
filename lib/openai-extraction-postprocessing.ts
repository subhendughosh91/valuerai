import OpenAI from "openai";
import { EXTRACTION_GROUPS, extractionSchema, type MinimumExtractionResult } from "./extraction-contract";
import { getConsistencyModel, getNormalizationModel } from "./openai-models";

type Scalar = string | number | boolean;

const normalizationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["updates"],
  properties: {
    updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["group", "field", "value", "reason"],
        properties: {
          group: { type: "string" },
          field: { type: "string" },
          value: { type: ["string", "number", "boolean"] },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

const consistencySchema = {
  type: "object",
  additionalProperties: false,
  required: ["warnings", "missing_required_fields"],
  properties: {
    warnings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "description", "severity", "source_documents"],
        properties: {
          field: { type: "string" },
          description: { type: "string" },
          severity: { type: "string", enum: ["INFO", "WARNING", "HIGH"] },
          source_documents: { type: "array", items: { type: "string" } },
        },
      },
    },
    missing_required_fields: { type: "array", items: { type: "string" } },
  },
} as const;

function populatedFields(result: MinimumExtractionResult) {
  const extractionResult = result.extraction_result as Record<string, any>;
  return EXTRACTION_GROUPS.flatMap((group) => group.fields.flatMap((definition) => {
    const field = extractionResult[group.key][definition.key];
    if (field.value === null && field.alternative_values.length === 0) return [];
    return [{ group: group.key, field: definition.key, label: definition.label, kind: definition.kind || "text", ...field }];
  }));
}

function fieldDefinition(groupKey: string, fieldKey: string) {
  const group = EXTRACTION_GROUPS.find((candidate) => candidate.key === groupKey);
  return group?.fields.find((candidate) => candidate.key === fieldKey);
}

function sameValue(left: unknown, right: unknown) {
  return typeof left === typeof right && String(left) === String(right);
}

export async function normalizeExtractedFields(extraction: MinimumExtractionResult, landRules: string): Promise<MinimumExtractionResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000, maxRetries: 1 });
  const response = await client.responses.create({
    model: getNormalizationModel(),
    reasoning: { effort: "low" },
    store: false,
    input: [
      {
        role: "system",
        content: `You are the ValuerAI normalisation stage. Return updates only for populated extracted fields that genuinely need formatting normalisation.

Permitted operations:
- Return all string update values and every normalisation reason in professional English using the Latin alphabet.
- Dates: use YYYY-MM-DD only when the complete date is unambiguous; otherwise preserve the source value while converting Bengali numeral glyphs to Arabic numerals.
- Names and places: remove accidental repeated whitespace and apply conventional capitalisation. Transliterate Bengali proper nouns into the Latin alphabet without changing identity, initials, ordering, or source-supported spelling. Prefer an English spelling already evidenced in the extracted record.
- Descriptive text: translate Bengali descriptions, addresses, relationships, boundary text, property descriptions, and land terminology into clear professional English without adding or omitting facts.
- Deed, Khatiyan, Dag, CS/Sebek, RS/Hal, mother and bata numbers: convert Bengali numerals to Arabic numerals and transliterate non-Latin identifier characters only when required for the English form. Preserve every component, sequence, separator, slash, and suffix. Never add, remove, transpose, infer, combine, renumber, or reinterpret identifiers.
- Currency: return a numeric value without symbols or thousands separators when the amount is unambiguous, including conversion of Bengali numeral glyphs.
- Area: normalise units and numeric formatting. Use recognised Roman-script land units such as Satak, Ganda, Kani, Acre, square feet, Bastu, Bhiti, and Tilla. Calculate a converted value only when the supplied land rules explicitly support the conversion.
- Boolean and numeric fields must retain their declared data type.
- If translation or transliteration is uncertain, do not guess. Preserve the existing value and omit the update so the extraction-stage LOW-confidence warning and original Bengali evidence remain available.

Never create facts, update blank fields, reconcile contradictions, choose between competing source values, or alter provenance. Omit unchanged fields.`,
      },
      { role: "user", content: `Published land rules:\n${landRules}\n\nPopulated extracted fields:\n${JSON.stringify(populatedFields(extraction))}` },
    ],
    text: { format: { type: "json_schema", name: "valuerai_field_normalisation", strict: true, schema: normalizationSchema } },
  });

  const parsed = JSON.parse(response.output_text) as { updates: Array<{ group: string; field: string; value: Scalar; reason: string }> };
  const normalized = structuredClone(extraction);
  for (const update of parsed.updates) {
    const definition = fieldDefinition(update.group, update.field);
    const target = (normalized.extraction_result as Record<string, any>)[update.group]?.[update.field];
    if (!definition || !target || target.value === null || sameValue(target.value, update.value)) continue;
    if (definition.kind === "number" && typeof update.value !== "number") continue;
    if (definition.kind === "boolean" && typeof update.value !== "boolean") continue;
    if (!definition.kind && typeof update.value !== "string") continue;
    target.alternative_values = [...target.alternative_values, {
      value: target.value,
      source_document: target.source_document,
      source_page_or_section: target.source_page_or_section,
      confidence: target.confidence,
      remarks: `Original extracted form retained before normalisation. ${update.reason}`,
    }];
    target.value = update.value;
    target.remarks = [target.remarks, `Normalised formatting: ${update.reason}`].filter(Boolean).join(" ");
  }
  return extractionSchema.parse(normalized);
}

export async function runExtractionConsistencyChecks(extraction: MinimumExtractionResult, rules: string): Promise<MinimumExtractionResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000, maxRetries: 1 });
  const response = await client.responses.create({
    model: getConsistencyModel(),
    reasoning: { effort: "low" },
    store: false,
    input: [
      {
        role: "system",
        content: "You are the ValuerAI consistency-check stage. Review the supplied extracted fields against one another and the published rules. Identify contradictions, suspicious mismatches, and report-critical missing fields. Do not modify, normalise, calculate, or invent factual values. Return every warning and missing-field description in professional English using the Latin alphabet. Transliterate Bengali proper nouns and convert Bengali numerals to Arabic numerals when they must be referenced, without changing the underlying source fact. If original Bengali wording is necessary for clarification, place it after the English explanation. A warning must state the exact fields and documents involved. Use HIGH only for material conflicts affecting ownership, property identity, area, access, or valuation eligibility.",
      },
      { role: "user", content: `Published extraction and land rules:\n${rules}\n\nPopulated extracted fields:\n${JSON.stringify(populatedFields(extraction))}` },
    ],
    text: { format: { type: "json_schema", name: "valuerai_consistency_checks", strict: true, schema: consistencySchema } },
  });

  const checks = JSON.parse(response.output_text) as {
    warnings: MinimumExtractionResult["extraction_result"]["validation_warnings"];
    missing_required_fields: string[];
  };
  const checked = structuredClone(extraction);
  const warningKeys = new Set(checked.extraction_result.validation_warnings.map((item) => `${item.field}|${item.description}`.toLowerCase()));
  for (const warning of checks.warnings) {
    const key = `${warning.field}|${warning.description}`.toLowerCase();
    if (!warningKeys.has(key)) checked.extraction_result.validation_warnings.push(warning);
    warningKeys.add(key);
  }
  checked.extraction_result.missing_required_fields = Array.from(new Set([...checked.extraction_result.missing_required_fields, ...checks.missing_required_fields]));
  return extractionSchema.parse(checked);
}
