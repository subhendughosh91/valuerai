import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";

const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required.`);

const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secretKeyFetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  if (headers.get("authorization") === `Bearer ${secretKey}`) headers.delete("authorization");
  return fetch(input, { ...init, headers });
};

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, secretKey, {
  global: { fetch: secretKeyFetch },
  auth: { autoRefreshToken: false, persistSession: false },
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const workerId = process.env.WORKER_ID || `ocr-${randomUUID()}`;
const pollMilliseconds = Number(process.env.OCR_WORKER_POLL_MS || 3000);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function transcribe(file, filename, mimeType) {
  const response = await openai.responses.create({
    model: process.env.OPENAI_OCR_MODEL || process.env.OPENAI_EXTRACTION_MODEL || "gpt-5",
    store: false,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: "Transcribe this property document faithfully into plain text. Preserve headings, field labels, names, numbers, dates, land-area units, and tables where legible. Do not infer, correct, translate, summarise, or calculate values. If a page is unreadable, write [illegible]." },
        { type: "input_file", filename, file_data: `data:${mimeType};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}` },
      ],
    }],
  });
  const text = response.output_text.trim();
  if (!text) throw new Error("OCR returned no text.");
  return text;
}

async function runJob(job) {
  const { data: document, error: documentError } = await supabase
    .from("valuation_documents")
    .select("id,storage_path,original_filename,mime_type,processing_metadata")
    .eq("id", job.document_id)
    .single();
  if (documentError || !document) throw new Error(documentError?.message || "Document not found.");

  const { data: file, error: downloadError } = await supabase.storage.from("valuation-documents").download(document.storage_path);
  if (downloadError || !file) throw new Error(downloadError?.message || "Unable to download document.");

  const text = await transcribe(file, document.original_filename, document.mime_type);
  const metadata = typeof document.processing_metadata === "object" && document.processing_metadata !== null ? document.processing_metadata : {};
  const completedAt = new Date().toISOString();

  const { error: updateDocumentError } = await supabase.from("valuation_documents").update({
    ocr_text: text,
    ocr_completed_at: completedAt,
    processing_metadata: { ...metadata, ocrStatus: "COMPLETE", ocrProvider: "openai-responses", workerId },
  }).eq("id", document.id);
  if (updateDocumentError) throw new Error(updateDocumentError.message);

  const { error: completeError } = await supabase.from("document_processing_jobs").update({
    status: "COMPLETE", completed_at: completedAt, locked_at: null, locked_by: null, last_error: null,
  }).eq("id", job.id);
  if (completeError) throw new Error(completeError.message);

  await supabase.from("audit_events").insert({
    valuation_id: job.valuation_id,
    event_type: "DOCUMENT_OCR_COMPLETED",
    payload: { documentId: document.id, jobId: job.id, provider: "openai-responses", workerId },
  });
}

async function failJob(job, error) {
  const message = error instanceof Error ? error.message : "Unknown OCR error.";
  const retry = job.attempts < 3;
  const nextAttempt = new Date(Date.now() + Math.max(job.attempts, 1) * 30_000).toISOString();
  await supabase.from("document_processing_jobs").update(retry ? {
    status: "QUEUED", available_at: nextAttempt, locked_at: null, locked_by: null, last_error: message,
  } : {
    status: "FAILED", completed_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error: message,
  }).eq("id", job.id);
  console.error(`[${workerId}] OCR job ${job.id} failed: ${message}`);
}

async function poll() {
  const { data: jobs, error } = await supabase.rpc("claim_document_processing_jobs", { worker_name: workerId, batch_size: 1 });
  if (error) throw new Error(error.message);
  for (const job of jobs || []) {
    try { await runJob(job); } catch (error) { await failJob(job, error); }
  }
  return (jobs || []).length;
}

console.log(`[${workerId}] Document OCR worker started.`);
while (true) {
  try { if (!(await poll())) await sleep(pollMilliseconds); }
  catch (error) { console.error(`[${workerId}] Worker polling error:`, error); await sleep(pollMilliseconds); }
}
