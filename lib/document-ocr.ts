import OpenAI from "openai";
import { getDocumentModel, getDocumentReasoningEffort, type ConfiguredReasoningEffort } from "./openai-models";

export type DocumentForOcr = {
  bytes: Buffer;
  filename: string;
  mimeType: string;
};

export function buildDocumentTranscriptionRequest(
  { bytes, filename, mimeType }: DocumentForOcr,
  options?: { background?: boolean; model?: string; reasoningEffort?: ConfiguredReasoningEffort },
) {
  const dataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;
  const documentInput = mimeType.startsWith("image/")
    ? {
        type: "input_image" as const,
        image_url: dataUrl,
        detail: "high" as const,
      }
    : {
        type: "input_file" as const,
        filename,
        file_data: dataUrl,
      };

  return {
    model: options?.model || getDocumentModel(),
    reasoning: { effort: options?.reasoningEffort || getDocumentReasoningEffort() },
    background: options?.background || false,
    store: false,
    input: [{
      role: "user" as const,
      content: [
        {
          type: "input_text" as const,
          text: "Transcribe this property document faithfully into plain text. Preserve headings, field labels, names, numbers, dates, land-area units, and tables where legible. Do not infer, correct, translate, summarise, or calculate values. If a page is unreadable, write [illegible].",
        },
        documentInput,
      ],
    }],
  };
}

export function parseDocumentTranscriptionResponse(response: { output_text: string }) {
  const text = response.output_text.trim();
  if (!text) throw new Error("OCR returned no text.");
  return text;
}

export async function extractDocumentText({ bytes, filename, mimeType }: DocumentForOcr) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 1 });
  const response = await client.responses.create(buildDocumentTranscriptionRequest({ bytes, filename, mimeType }));
  return parseDocumentTranscriptionResponse(response);
}
