import OpenAI from "openai";
import { buildDocumentTranscriptionRequest, parseDocumentTranscriptionResponse } from "./document-ocr";
import { buildStructuredExtractionRequest, parseStructuredExtractionResponse } from "./openai-extraction";
import { normalizeExtractedFields, runExtractionConsistencyChecks } from "./openai-extraction-postprocessing";
import { AI_CREDITS_EXHAUSTED_MESSAGE, isAiCreditsExhausted } from "./openai-errors";
import { getAiModelConfiguration } from "./openai-models";
import { createSupabaseAdminClient } from "./supabase/admin";

const DOCUMENT_CONCURRENCY = 2;
const MAX_SUBMISSION_ATTEMPTS = 3;
const TERMINAL_RESPONSE_STATUSES = new Set(["completed", "failed", "incomplete", "cancelled"]);

type BackgroundDocument = {
  id: string;
  kind: string;
  other_document_types?: string[] | null;
  original_filename: string;
  mime_type: string;
  storage_path: string;
  ocr_text?: string | null;
};

type PublishedRule = { id: string; kind: string; content: string };

type ProcessingStep = {
  id: string;
  extraction_run_id: string;
  valuation_id: string;
  document_id: string | null;
  stage: "DOCUMENT_OCR" | "STRUCTURED_EXTRACTION";
  status: "QUEUED" | "SUBMITTING" | "IN_PROGRESS" | "PROCESSING" | "COMPLETE" | "FAILED" | "CANCELLED";
  openai_response_id: string | null;
  model: string;
  reasoning_effort: "minimal" | "low" | "medium" | "high";
  attempt: number;
  error: string | null;
  updated_at: string;
};

type ExtractionSnapshot = {
  documentIds: string[];
  extractionRuleId: string;
  landRuleId: string;
  customInstructions?: string | null;
  models: Record<string, string>;
  reasoningEfforts: { document: string; extraction: string };
};

function openAiClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
}

function errorMessage(error: unknown, fallback = "Background extraction failed.") {
  return error instanceof Error ? error.message : fallback;
}

function documentKind(document: BackgroundDocument) {
  return document.kind === "OTHER" && document.other_document_types?.length
    ? `OTHER - ${document.other_document_types.join(", ")}`
    : document.kind;
}

function responseFailureMessage(response: OpenAI.Responses.Response) {
  if (response.error?.message) return response.error.message;
  if (response.incomplete_details) return `OpenAI response ${response.status}: ${JSON.stringify(response.incomplete_details)}`;
  return `OpenAI response ended with status ${response.status || "unknown"}.`;
}

export async function createBackgroundExtractionRun(input: {
  valuationId: string;
  actorId: string;
  customInstructions?: string | null;
  documents: BackgroundDocument[];
  extractionRule: PublishedRule;
  landRule: PublishedRule;
}) {
  const admin = createSupabaseAdminClient();
  const models = getAiModelConfiguration();
  const now = new Date().toISOString();

  const { data: claimed, error: claimError } = await admin
    .from("valuations")
    .update({ status: "EXTRACTING", processing_error: null })
    .eq("id", input.valuationId)
    .eq("user_id", input.actorId)
    .in("status", ["UPLOADING", "DRAFT"])
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) {
    const { data: current } = await admin.from("valuations").select("status").eq("id", input.valuationId).single();
    if (current?.status === "EXTRACTING") {
      const { data: existingRun } = await admin
        .from("extraction_runs")
        .select("id")
        .eq("valuation_id", input.valuationId)
        .eq("status", "RUNNING")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { runId: existingRun?.id || null, alreadyRunning: true };
    }
    throw new Error("Extraction is not available at the current valuation stage.");
  }

  const snapshot: ExtractionSnapshot = {
    documentIds: input.documents.map((document) => document.id),
    extractionRuleId: input.extractionRule.id,
    landRuleId: input.landRule.id,
    customInstructions: input.customInstructions || null,
    models: {
      document: models.document,
      extraction: models.extraction,
      normalization: models.normalization,
      consistency: models.consistency,
    },
    reasoningEfforts: {
      document: models.documentReasoningEffort,
      extraction: models.extractionReasoningEffort,
    },
  };

  const { data: run, error: runError } = await admin.from("extraction_runs").insert({
    valuation_id: input.valuationId,
    status: "RUNNING",
    model: models.extraction,
    input_snapshot: snapshot,
    started_at: now,
  }).select("id").single();

  if (runError || !run) {
    await admin.from("valuations").update({
      status: "UPLOADING",
      processing_error: "Extraction could not be started. Please try again.",
    }).eq("id", input.valuationId).eq("status", "EXTRACTING");
    throw new Error(runError?.message || "Extraction could not be started.");
  }

  const steps = input.documents.map((document) => ({
    extraction_run_id: run.id,
    valuation_id: input.valuationId,
    document_id: document.id,
    stage: "DOCUMENT_OCR",
    status: document.ocr_text ? "COMPLETE" : "QUEUED",
    model: models.document,
    reasoning_effort: models.documentReasoningEffort,
    completed_at: document.ocr_text ? now : null,
  }));
  const { error: stepsError } = await admin.from("ai_processing_steps").insert(steps);
  if (stepsError) {
    await failExtractionRun(run.id, `Processing steps could not be created: ${stepsError.message}`);
    throw new Error("Extraction could not be started. Please try again.");
  }

  await Promise.all(input.documents.map((document) => admin.from("valuation_documents").update({
    processing_metadata: {
      ocrStatus: document.ocr_text ? "COMPLETE" : "QUEUED",
      ocrProvider: "openai-background-responses",
      ocrModel: models.document,
      mode: "background-on-start-valuation",
    },
  }).eq("id", document.id)));

  await admin.from("audit_events").insert({
    actor_id: input.actorId,
    valuation_id: input.valuationId,
    event_type: "BACKGROUND_EXTRACTION_STARTED",
    payload: {
      extractionRunId: run.id,
      documentCount: input.documents.length,
      documentModel: models.document,
      extractionModel: models.extraction,
    },
  });
  console.info("[background-extraction] run created", { valuationId: input.valuationId, extractionRunId: run.id, documentCount: input.documents.length });
  return { runId: run.id, alreadyRunning: false };
}

async function failExtractionRun(runId: string, message: string) {
  const admin = createSupabaseAdminClient();
  const completedAt = new Date().toISOString();
  const { data: run } = await admin.from("extraction_runs").select("valuation_id,status").eq("id", runId).single();
  if (!run || run.status !== "RUNNING") return;
  const { data: activeResponses } = await admin.from("ai_processing_steps").select("openai_response_id")
    .eq("extraction_run_id", runId).in("status", ["SUBMITTING", "IN_PROGRESS", "PROCESSING"]).not("openai_response_id", "is", null);

  await admin.from("extraction_runs").update({ status: "FAILED", error: message, completed_at: completedAt }).eq("id", runId).eq("status", "RUNNING");
  await admin.from("ai_processing_steps").update({ status: "CANCELLED", error: "Cancelled because the extraction run failed.", completed_at: completedAt })
    .eq("extraction_run_id", runId).in("status", ["QUEUED", "SUBMITTING", "IN_PROGRESS", "PROCESSING"]);
  await admin.from("valuations").update({ status: "UPLOADING", processing_error: message })
    .eq("id", run.valuation_id).eq("status", "EXTRACTING");
  if (process.env.OPENAI_API_KEY) {
    const client = openAiClient();
    await Promise.allSettled((activeResponses || []).map((step) => client.responses.cancel(step.openai_response_id)));
  }

  const { data: documents } = await admin.from("valuation_documents").select("id,ocr_text,processing_metadata").eq("valuation_id", run.valuation_id);
  await Promise.all((documents || []).map((document) => admin.from("valuation_documents").update({
    processing_metadata: {
      ...(document.processing_metadata || {}),
      ocrStatus: document.ocr_text ? "COMPLETE" : "PENDING",
      error: document.ocr_text ? null : message,
    },
  }).eq("id", document.id)));

  await admin.from("audit_events").insert({
    valuation_id: run.valuation_id,
    event_type: "BACKGROUND_EXTRACTION_FAILED",
    payload: { extractionRunId: runId, error: message, uploadsRetained: true },
  });
  console.error("[background-extraction] run failed", { extractionRunId: runId, valuationId: run.valuation_id, error: message });
}

async function retryOrFailSubmission(step: ProcessingStep, error: unknown) {
  const admin = createSupabaseAdminClient();
  const message = isAiCreditsExhausted(error) ? AI_CREDITS_EXHAUSTED_MESSAGE : errorMessage(error, "OpenAI background request could not be submitted.");
  if (!isAiCreditsExhausted(error) && step.attempt < MAX_SUBMISSION_ATTEMPTS) {
    await admin.from("ai_processing_steps").update({
      status: "QUEUED",
      attempt: step.attempt + 1,
      error: message,
    }).eq("id", step.id).eq("status", "SUBMITTING");
    return;
  }
  await admin.from("ai_processing_steps").update({ status: "FAILED", error: message, completed_at: new Date().toISOString() }).eq("id", step.id);
  await failExtractionRun(step.extraction_run_id, message);
}

async function submitDocumentStep(step: ProcessingStep) {
  const admin = createSupabaseAdminClient();
  try {
    const { data: document, error: documentError } = await admin
      .from("valuation_documents")
      .select("id,original_filename,mime_type,storage_path,ocr_text")
      .eq("id", step.document_id)
      .single();
    if (documentError || !document) throw new Error(documentError?.message || "The document record is unavailable.");

    if (document.ocr_text) {
      await admin.from("ai_processing_steps").update({ status: "COMPLETE", completed_at: new Date().toISOString(), error: null }).eq("id", step.id).eq("status", "SUBMITTING");
      return;
    }

    const { data: file, error: downloadError } = await admin.storage.from("valuation-documents").download(document.storage_path);
    if (downloadError || !file) throw new Error(downloadError?.message || `Unable to read ${document.original_filename}.`);

    const response = await openAiClient().responses.create(buildDocumentTranscriptionRequest({
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: document.original_filename,
      mimeType: document.mime_type,
    }, {
      background: true,
      model: step.model,
      reasoningEffort: step.reasoning_effort,
    }), { idempotencyKey: `valuerai-processing-step-${step.id}` });

    const submittedAt = new Date().toISOString();
    await admin.from("ai_processing_steps").update({
      status: "IN_PROGRESS",
      openai_response_id: response.id,
      submitted_at: submittedAt,
      error: null,
    }).eq("id", step.id).eq("status", "SUBMITTING");
    await admin.from("valuation_documents").update({
      processing_metadata: {
        ocrStatus: "RUNNING",
        ocrProvider: "openai-background-responses",
        ocrModel: step.model,
        openaiResponseId: response.id,
        mode: "background-on-start-valuation",
      },
    }).eq("id", document.id);
    console.info("[background-extraction] document submitted", { extractionRunId: step.extraction_run_id, documentId: document.id, responseId: response.id, model: step.model, attempt: step.attempt });

    if (TERMINAL_RESPONSE_STATUSES.has(response.status || "")) await processStepResponse({ ...step, status: "IN_PROGRESS", openai_response_id: response.id }, response);
  } catch (error) {
    console.error("[background-extraction] document submission failed", { extractionRunId: step.extraction_run_id, documentId: step.document_id, error: errorMessage(error) });
    await retryOrFailSubmission(step, error);
  }
}

async function ensureStructuredStep(runId: string, valuationId: string, snapshot: ExtractionSnapshot) {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from("ai_processing_steps").select("*").eq("extraction_run_id", runId).eq("stage", "STRUCTURED_EXTRACTION").maybeSingle();
  if (existing) return existing as ProcessingStep;
  const { data, error } = await admin.from("ai_processing_steps").insert({
    extraction_run_id: runId,
    valuation_id: valuationId,
    document_id: null,
    stage: "STRUCTURED_EXTRACTION",
    status: "QUEUED",
    model: snapshot.models.extraction,
    reasoning_effort: snapshot.reasoningEfforts.extraction,
  }).select("*").single();
  if (!error && data) return data as ProcessingStep;
  const { data: raced } = await admin.from("ai_processing_steps").select("*").eq("extraction_run_id", runId).eq("stage", "STRUCTURED_EXTRACTION").maybeSingle();
  if (raced) return raced as ProcessingStep;
  throw new Error(error?.message || "Structured extraction step could not be created.");
}

async function submitStructuredStep(step: ProcessingStep, snapshot: ExtractionSnapshot) {
  const admin = createSupabaseAdminClient();
  const { data: claimed } = await admin.from("ai_processing_steps").update({
    status: "SUBMITTING",
    started_at: new Date().toISOString(),
    error: null,
  }).eq("id", step.id).eq("status", "QUEUED").select("*").maybeSingle();
  if (!claimed) return;
  const claimedStep = claimed as ProcessingStep;

  try {
    const [{ data: rules }, { data: documents, error: documentsError }] = await Promise.all([
      admin.from("state_rule_versions").select("id,kind,content").in("id", [snapshot.extractionRuleId, snapshot.landRuleId]),
      admin.from("valuation_documents").select("id,kind,other_document_types,original_filename,ocr_text").in("id", snapshot.documentIds),
    ]);
    if (documentsError || !documents?.length || documents.some((document) => !document.ocr_text)) {
      throw new Error(documentsError?.message || "One or more document transcriptions are unavailable.");
    }
    const extractionRule = rules?.find((rule) => rule.id === snapshot.extractionRuleId);
    const landRule = rules?.find((rule) => rule.id === snapshot.landRuleId);
    if (!extractionRule || !landRule) throw new Error("The published extraction rules used by this run are unavailable.");

    const combinedRules = `EXTRACTION ENGINE INSTRUCTIONS\n${extractionRule.content}\n\nSHARED LAND RULES\n${landRule.content}`;
    const response = await openAiClient().responses.create(buildStructuredExtractionRequest({
      rules: combinedRules,
      documents: documents.map((document) => ({
        id: document.id,
        kind: documentKind(document as BackgroundDocument),
        name: document.original_filename,
        text: document.ocr_text,
      })),
      customInstructions: snapshot.customInstructions,
    }, {
      background: true,
      model: claimedStep.model,
      reasoningEffort: claimedStep.reasoning_effort,
    }), { idempotencyKey: `valuerai-processing-step-${claimedStep.id}` });

    await admin.from("ai_processing_steps").update({
      status: "IN_PROGRESS",
      openai_response_id: response.id,
      submitted_at: new Date().toISOString(),
      error: null,
    }).eq("id", claimedStep.id).eq("status", "SUBMITTING");
    console.info("[background-extraction] structured extraction submitted", { extractionRunId: claimedStep.extraction_run_id, responseId: response.id, model: claimedStep.model });
    if (TERMINAL_RESPONSE_STATUSES.has(response.status || "")) await processStepResponse({ ...claimedStep, status: "IN_PROGRESS", openai_response_id: response.id }, response);
  } catch (error) {
    console.error("[background-extraction] structured submission failed", { extractionRunId: step.extraction_run_id, error: errorMessage(error) });
    await retryOrFailSubmission(claimedStep, error);
  }
}

async function completeDocumentStep(step: ProcessingStep, response: OpenAI.Responses.Response) {
  const admin = createSupabaseAdminClient();
  const { data: claimed } = await admin.from("ai_processing_steps").update({ status: "PROCESSING", error: null })
    .eq("id", step.id).eq("status", "IN_PROGRESS").select("id").maybeSingle();
  if (!claimed) return;
  try {
    const text = parseDocumentTranscriptionResponse(response);
    const completedAt = new Date().toISOString();
    const { data: document } = await admin.from("valuation_documents").select("id").eq("id", step.document_id).single();
    if (!document) throw new Error("The document was removed before transcription completed.");

    await admin.from("valuation_documents").update({
      ocr_text: text,
      ocr_completed_at: completedAt,
      processing_metadata: {
        ocrStatus: "COMPLETE",
        ocrProvider: "openai-background-responses",
        ocrModel: step.model,
        openaiResponseId: response.id,
        mode: "background-on-start-valuation",
      },
    }).eq("id", step.document_id);
    await admin.from("ai_processing_steps").update({ status: "COMPLETE", completed_at: completedAt, error: null })
      .eq("id", step.id).eq("status", "PROCESSING");
    await admin.from("audit_events").insert({
      valuation_id: step.valuation_id,
      event_type: "DOCUMENT_OCR_COMPLETED",
      payload: { documentId: step.document_id, extractionRunId: step.extraction_run_id, provider: "openai-background-responses", model: step.model, responseId: response.id },
    });
    console.info("[background-extraction] document completed", { extractionRunId: step.extraction_run_id, documentId: step.document_id, responseId: response.id });
  } catch (error) {
    const message = errorMessage(error, "Document transcription could not be saved.");
    await admin.from("ai_processing_steps").update({ status: "FAILED", error: message, completed_at: new Date().toISOString() }).eq("id", step.id).eq("status", "PROCESSING");
    await failExtractionRun(step.extraction_run_id, message);
  }
}

async function completeStructuredStep(step: ProcessingStep, response: OpenAI.Responses.Response) {
  const admin = createSupabaseAdminClient();
  const { data: claimed } = await admin.from("ai_processing_steps").update({ status: "PROCESSING", error: null })
    .eq("id", step.id).eq("status", "IN_PROGRESS").select("id").maybeSingle();
  if (!claimed) return;

  try {
    const { data: run } = await admin.from("extraction_runs").select("valuation_id,status,input_snapshot").eq("id", step.extraction_run_id).single();
    if (!run || run.status !== "RUNNING") return;
    const snapshot = run.input_snapshot as ExtractionSnapshot;
    const { data: rules } = await admin.from("state_rule_versions").select("id,content").in("id", [snapshot.extractionRuleId, snapshot.landRuleId]);
    const extractionRule = rules?.find((rule) => rule.id === snapshot.extractionRuleId);
    const landRule = rules?.find((rule) => rule.id === snapshot.landRuleId);
    if (!extractionRule || !landRule) throw new Error("The published rules used by this extraction are unavailable.");

    const extracted = parseStructuredExtractionResponse(response);
    const combinedRules = `EXTRACTION ENGINE INSTRUCTIONS\n${extractionRule.content}\n\nSHARED LAND RULES\n${landRule.content}`;
    const postProcessingStartedAt = Date.now();
    const [normalizationResult, consistencyResult] = await Promise.allSettled([
      normalizeExtractedFields(extracted, landRule.content),
      runExtractionConsistencyChecks(extracted, combinedRules),
    ]);
    const checked = structuredClone(normalizationResult.status === "fulfilled" ? normalizationResult.value : extracted);
    if (normalizationResult.status === "rejected") {
      console.error("[background-extraction] normalization failed; preserving extracted values", { extractionRunId: step.extraction_run_id, error: String(normalizationResult.reason) });
    }
    if (consistencyResult.status === "fulfilled") {
      const warningKeys = new Set(checked.extraction_result.validation_warnings.map((warning) => `${warning.field}|${warning.description}`.toLowerCase()));
      for (const warning of consistencyResult.value.extraction_result.validation_warnings) {
        const key = `${warning.field}|${warning.description}`.toLowerCase();
        if (!warningKeys.has(key)) checked.extraction_result.validation_warnings.push(warning);
        warningKeys.add(key);
      }
      checked.extraction_result.missing_required_fields = Array.from(new Set([
        ...checked.extraction_result.missing_required_fields,
        ...consistencyResult.value.extraction_result.missing_required_fields,
      ]));
    } else {
      console.error("[background-extraction] consistency checks failed; preserving extraction warnings", { extractionRunId: step.extraction_run_id, error: String(consistencyResult.reason) });
    }
    console.info("[background-extraction] post-processing completed", { extractionRunId: step.extraction_run_id, durationMs: Date.now() - postProcessingStartedAt });

    const { data: completed, error: completionError } = await admin.rpc("complete_background_extraction", {
      p_run_id: step.extraction_run_id,
      p_step_id: step.id,
      p_output: checked,
      p_evidence: checked.extraction_result.source_trace,
      p_contradictions: checked.extraction_result.validation_warnings,
      p_extraction_rule_id: snapshot.extractionRuleId,
      p_land_rule_id: snapshot.landRuleId,
    });
    if (completionError || completed !== true) throw new Error(completionError?.message || "Extraction was cancelled before completion.");
    await admin.from("audit_events").insert({
      valuation_id: run.valuation_id,
      event_type: "EXTRACTION_COMPLETED",
      payload: {
        extractionRunId: step.extraction_run_id,
        warnings: checked.extraction_result.validation_warnings.length,
        missingRequiredFields: checked.extraction_result.missing_required_fields.length,
        mode: "openai-background-responses",
      },
    });
    console.info("[background-extraction] run completed", { extractionRunId: step.extraction_run_id, valuationId: run.valuation_id });
  } catch (error) {
    const message = isAiCreditsExhausted(error) ? AI_CREDITS_EXHAUSTED_MESSAGE : errorMessage(error, "Structured extraction processing failed.");
    await admin.from("ai_processing_steps").update({ status: "FAILED", error: message, completed_at: new Date().toISOString() }).eq("id", step.id);
    await failExtractionRun(step.extraction_run_id, message);
  }
}

async function processStepResponse(step: ProcessingStep, response: OpenAI.Responses.Response) {
  if (response.status === "completed") {
    if (step.stage === "DOCUMENT_OCR") await completeDocumentStep(step, response);
    else await completeStructuredStep(step, response);
    return;
  }
  if (["failed", "incomplete", "cancelled"].includes(response.status || "")) {
    const message = responseFailureMessage(response);
    const admin = createSupabaseAdminClient();
    await admin.from("ai_processing_steps").update({
      status: response.status === "cancelled" ? "CANCELLED" : "FAILED",
      error: message,
      completed_at: new Date().toISOString(),
    }).eq("id", step.id).in("status", ["SUBMITTING", "IN_PROGRESS", "PROCESSING"]);
    await failExtractionRun(step.extraction_run_id, message);
  }
}

async function recoverInterruptedStepClaims(runId: string) {
  const admin = createSupabaseAdminClient();
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: staleSubmitting } = await admin.from("ai_processing_steps").select("*")
    .eq("extraction_run_id", runId).eq("status", "SUBMITTING").is("openai_response_id", null).lt("updated_at", staleBefore);
  for (const step of (staleSubmitting || []) as ProcessingStep[]) {
    if (step.attempt >= MAX_SUBMISSION_ATTEMPTS) {
      await failExtractionRun(runId, "OpenAI background request submission could not be confirmed.");
      return;
    }
    await admin.from("ai_processing_steps").update({ status: "QUEUED", attempt: step.attempt + 1, error: "Recovering an interrupted request submission." }).eq("id", step.id).eq("status", "SUBMITTING");
  }

  await admin.from("ai_processing_steps").update({ status: "IN_PROGRESS", error: "Recovering interrupted completion processing." })
    .eq("extraction_run_id", runId).eq("status", "PROCESSING").lt("updated_at", staleBefore);
}

export async function advanceBackgroundExtraction(runId: string, responseId?: string | null) {
  const admin = createSupabaseAdminClient();
  const { data: run } = await admin.from("extraction_runs").select("id,valuation_id,status,input_snapshot").eq("id", runId).single();
  if (!run || run.status !== "RUNNING") return;
  const { data: valuation } = await admin.from("valuations").select("status").eq("id", run.valuation_id).single();
  if (!valuation || valuation.status !== "EXTRACTING") {
    await failExtractionRun(runId, "Extraction was cancelled before completion.");
    return;
  }

  await recoverInterruptedStepClaims(runId);
  const client = openAiClient();
  let activeQuery = admin.from("ai_processing_steps").select("*").eq("extraction_run_id", runId).eq("status", "IN_PROGRESS").not("openai_response_id", "is", null);
  if (responseId) activeQuery = activeQuery.eq("openai_response_id", responseId);
  const { data: activeSteps } = await activeQuery;

  await Promise.all((activeSteps || []).map(async (rawStep) => {
    const step = rawStep as ProcessingStep;
    try {
      const response = await client.responses.retrieve(step.openai_response_id!);
      if (response.status === "queued" || response.status === "in_progress") return;
      await processStepResponse(step, response);
    } catch (error) {
      const message = errorMessage(error, "The temporary OpenAI background result is no longer available.");
      await admin.from("ai_processing_steps").update({ status: "FAILED", error: message, completed_at: new Date().toISOString() }).eq("id", step.id).eq("status", "IN_PROGRESS");
      await failExtractionRun(runId, `${message} Your uploaded documents and completed document text have been retained; select Start Valuation to retry.`);
    }
  }));

  const { data: currentRun } = await admin.from("extraction_runs").select("status").eq("id", runId).single();
  if (currentRun?.status !== "RUNNING") return;
  const { data: steps } = await admin.from("ai_processing_steps").select("*").eq("extraction_run_id", runId);
  const documentSteps = ((steps || []) as ProcessingStep[]).filter((step) => step.stage === "DOCUMENT_OCR");
  if (documentSteps.some((step) => ["FAILED", "CANCELLED"].includes(step.status))) {
    await failExtractionRun(runId, "One or more documents could not be transcribed. Uploaded files and completed document text have been retained.");
    return;
  }

  if (documentSteps.some((step) => step.status !== "COMPLETE")) {
    const { data: claimedSteps, error: claimError } = await admin.rpc("claim_ai_document_steps", { p_run_id: runId, p_concurrency: DOCUMENT_CONCURRENCY });
    if (claimError) {
      await failExtractionRun(runId, `Document processing could not be scheduled: ${claimError.message}`);
      return;
    }
    await Promise.all(((claimedSteps || []) as ProcessingStep[]).map((step) => submitDocumentStep(step)));
    return;
  }

  const snapshot = run.input_snapshot as ExtractionSnapshot;
  try {
    const structuredStep = await ensureStructuredStep(runId, run.valuation_id, snapshot);
    if (structuredStep.status === "QUEUED") await submitStructuredStep(structuredStep, snapshot);
  } catch (error) {
    await failExtractionRun(runId, errorMessage(error, "Structured extraction could not be scheduled."));
  }
}

export async function advanceBackgroundExtractionByResponseId(responseId: string) {
  const admin = createSupabaseAdminClient();
  const { data: step } = await admin.from("ai_processing_steps").select("extraction_run_id").eq("openai_response_id", responseId).maybeSingle();
  if (!step) return;
  await advanceBackgroundExtraction(step.extraction_run_id, responseId);
  await advanceBackgroundExtraction(step.extraction_run_id);
}

export async function cancelBackgroundExtraction(valuationId: string) {
  const admin = createSupabaseAdminClient();
  const { data: steps } = await admin.from("ai_processing_steps").select("id,openai_response_id")
    .eq("valuation_id", valuationId).in("status", ["SUBMITTING", "IN_PROGRESS", "PROCESSING"]);
  const client = openAiClient();
  await Promise.allSettled((steps || []).filter((step) => step.openai_response_id).map((step) => client.responses.cancel(step.openai_response_id)));
  await admin.from("ai_processing_steps").update({ status: "CANCELLED", error: "Cancelled by the user.", completed_at: new Date().toISOString() })
    .eq("valuation_id", valuationId).in("status", ["QUEUED", "SUBMITTING", "IN_PROGRESS", "PROCESSING"]);
}

export async function getBackgroundExtractionStatus(valuationId: string) {
  const admin = createSupabaseAdminClient();
  const { data: run } = await admin.from("extraction_runs").select("id,status,model,error,started_at,completed_at")
    .eq("valuation_id", valuationId).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!run) return null;
  const { data: steps } = await admin.from("ai_processing_steps").select("stage,status,model,error,attempt,document_id,created_at,updated_at")
    .eq("extraction_run_id", run.id).order("created_at", { ascending: true });
  const allSteps = (steps || []) as Array<Pick<ProcessingStep, "stage" | "status" | "model" | "error" | "attempt" | "document_id">>;
  const documentSteps = allSteps.filter((step) => step.stage === "DOCUMENT_OCR");
  const structuredStep = allSteps.find((step) => step.stage === "STRUCTURED_EXTRACTION");
  const completedDocuments = documentSteps.filter((step) => step.status === "COMPLETE").length;
  let phase = "PREPARING";
  if (run.status === "COMPLETE") phase = "COMPLETE";
  else if (run.status === "FAILED") phase = "FAILED";
  else if (structuredStep?.status === "PROCESSING") phase = "POST_PROCESSING";
  else if (structuredStep) phase = "STRUCTURED_EXTRACTION";
  else if (documentSteps.length) phase = "DOCUMENT_READING";

  return {
    runId: run.id,
    runStatus: run.status,
    phase,
    documentCount: documentSteps.length,
    completedDocuments,
    activeDocuments: documentSteps.filter((step) => ["SUBMITTING", "IN_PROGRESS", "PROCESSING"].includes(step.status)).length,
    model: structuredStep?.model || documentSteps.find((step) => step.status !== "COMPLETE")?.model || run.model,
    retryable: run.status === "FAILED",
    error: run.error || allSteps.find((step) => ["FAILED", "CANCELLED"].includes(step.status))?.error || null,
    startedAt: run.started_at,
    completedAt: run.completed_at,
  };
}
