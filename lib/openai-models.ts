/**
 * Server-side model configuration for each ValuerAI AI workload.
 *
 * Keep these names unprefixed by NEXT_PUBLIC_: model selection, like the API
 * key, is server configuration and should not be bundled into the browser.
 */
const DEFAULT_MODELS = {
  document: "gpt-5.5",
  extraction: "gpt-5.5",
  normalization: "gpt-5-mini",
  valuation: "gpt-5.5",
  consistency: "gpt-5-nano",
} as const;

export type ConfiguredReasoningEffort = "minimal" | "low" | "medium" | "high";

function configuredModel(variableName: string, fallback: string) {
  return process.env[variableName]?.trim() || fallback;
}

function configuredReasoningEffort(variableName: string, model: string): ConfiguredReasoningEffort {
  const fallback: ConfiguredReasoningEffort = model.toLowerCase().includes("pro") ? "medium" : "low";
  const configured = process.env[variableName]?.trim().toLowerCase() || fallback;
  const allowed: ConfiguredReasoningEffort[] = model.toLowerCase().includes("pro")
    ? ["medium", "high"]
    : ["minimal", "low", "medium", "high"];

  if (!allowed.includes(configured as ConfiguredReasoningEffort)) {
    throw new Error(`${variableName}=${configured} is not supported for ${model}. Allowed values: ${allowed.join(", ")}.`);
  }
  return configured as ConfiguredReasoningEffort;
}

export function getExtractionModel() {
  return configuredModel("OPENAI_EXTRACTION_MODEL", DEFAULT_MODELS.extraction);
}

export function getValuationModel() {
  return configuredModel("OPENAI_VALUATION_MODEL", DEFAULT_MODELS.valuation);
}

export function getDocumentModel() {
  return configuredModel("OPENAI_DOCUMENT_MODEL", DEFAULT_MODELS.document);
}

export function getNormalizationModel() {
  return configuredModel("OPENAI_NORMALIZATION_MODEL", DEFAULT_MODELS.normalization);
}

export function getConsistencyModel() {
  return configuredModel("OPENAI_CONSISTENCY_MODEL", DEFAULT_MODELS.consistency);
}

export function getDocumentReasoningEffort() {
  return configuredReasoningEffort("OPENAI_DOCUMENT_REASONING_EFFORT", getDocumentModel());
}

export function getExtractionReasoningEffort() {
  return configuredReasoningEffort("OPENAI_EXTRACTION_REASONING_EFFORT", getExtractionModel());
}

export function isBackgroundExtractionEnabled() {
  return process.env.OPENAI_BACKGROUND_EXTRACTION_ENABLED?.trim().toLowerCase() === "true";
}

export function getAiModelConfiguration() {
  return {
    document: getDocumentModel(),
    extraction: getExtractionModel(),
    normalization: getNormalizationModel(),
    valuation: getValuationModel(),
    consistency: getConsistencyModel(),
    documentReasoningEffort: getDocumentReasoningEffort(),
    extractionReasoningEffort: getExtractionReasoningEffort(),
  };
}
