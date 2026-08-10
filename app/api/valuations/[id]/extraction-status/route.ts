import { after, NextResponse } from "next/server";
import { requireProfile } from "../../../../../lib/auth";
import { advanceBackgroundExtraction, getBackgroundExtractionStatus } from "../../../../../lib/openai-background-extraction";
import { isBackgroundExtractionEnabled } from "../../../../../lib/openai-models";

export const maxDuration = 120;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireProfile();
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data: valuation } = await context.supabase.from("valuations").select("id,status,processing_error").eq("id", id).single();
  if (!valuation) return NextResponse.json({ error: "Valuation not found." }, { status: 404 });

  const expectedRunId = new URL(request.url).searchParams.get("runId");
  const status = await getBackgroundExtractionStatus(id, expectedRunId);
  if (isBackgroundExtractionEnabled() && status?.runStatus === "RUNNING") {
    after(async () => {
      try {
        await advanceBackgroundExtraction(status.runId);
      } catch (error) {
        console.error("[background-extraction] status reconciliation failed", { extractionRunId: status.runId, error: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  if (status) return NextResponse.json({ extraction: status });
  return NextResponse.json({
    extraction: {
      runId: null,
      runStatus: valuation.status === "EXTRACTING" ? "RUNNING" : valuation.status === "REVIEW_REQUIRED" ? "COMPLETE" : "FAILED",
      phase: valuation.status === "REVIEW_REQUIRED" ? "COMPLETE" : valuation.status === "EXTRACTING" ? "PREPARING" : "FAILED",
      documentCount: 0,
      completedDocuments: 0,
      activeDocuments: 0,
      model: null,
      retryable: valuation.status === "UPLOADING",
      error: valuation.processing_error,
    },
  });
}
