import OpenAI from "openai";

type DocumentForOcr = {
  bytes: Buffer;
  filename: string;
  mimeType: string;
};

export async function extractDocumentText({ bytes, filename, mimeType }: DocumentForOcr) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_OCR_MODEL || process.env.OPENAI_EXTRACTION_MODEL || "gpt-5",
    store: false,
    input: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: "Transcribe this property document faithfully into plain text. Preserve headings, field labels, names, numbers, dates, land-area units, and tables where legible. Do not infer, correct, translate, summarise, or calculate values. If a page is unreadable, write [illegible].",
        },
        {
          type: "input_file",
          filename,
          file_data: `data:${mimeType};base64,${bytes.toString("base64")}`,
        },
      ],
    }],
  });

  const text = response.output_text.trim();
  if (!text) throw new Error("OCR returned no text.");
  return text;
}
