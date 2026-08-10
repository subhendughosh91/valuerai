import OpenAI from "openai";
import { getDocumentModel } from "./openai-models";

type DocumentForOcr = {
  bytes: Buffer;
  filename: string;
  mimeType: string;
};

export async function extractDocumentText({ bytes, filename, mimeType }: DocumentForOcr) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

  const response = await client.responses.create({
    model: getDocumentModel(),
    store: false,
    input: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: "Transcribe this property document faithfully into plain text. Preserve headings, field labels, names, numbers, dates, land-area units, and tables where legible. Do not infer, correct, translate, summarise, or calculate values. If a page is unreadable, write [illegible].",
        },
        documentInput,
      ],
    }],
  });

  const text = response.output_text.trim();
  if (!text) throw new Error("OCR returned no text.");
  return text;
}
