"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { EXTRACTION_GROUPS, normalizeExtractionResult, type ExtractionFieldKind } from "../lib/extraction-contract";
import { INDIA_STATE_OPTIONS } from "../lib/india-states";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

const documents = [
  ["SALE_DEED", "Sale deed"],
  ["KHATIYAN", "Khatiyan"],
  ["BUILDING_PLAN", "Building plan"],
  ["SALE_AGREEMENT", "Sale agreement"],
  ["RS_HAL_DAG_MAP", "RS Hal Dag no."],
  ["GOVT_GUIDELINE_RATE", "Govt. guideline land rate"],
  ["ELECTRICITY_BILL", "Electricity bill"],
  ["MUNICIPAL_TAX", "Municipal tax document"],
  ["KYC", "KYC document"],
  ["OTHER", "Other documents"],
] as const;

type UploadStage = "QUEUED" | "UPLOADING" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
type UploadEntry = { id: string; documentId?: string; name: string; stage: UploadStage; error?: string };
type ExtractionPhase = "PREPARING" | "OCR" | "AI" | "REVIEW";
type ExtractionProgress = { phase: ExtractionPhase; title: string; detail: string; completed: number; total: number; percent: number };
type ValuationPhase = "APPROVING" | "VALUING" | "REPORTING" | "COMPLETE";

const uploadStageLabel: Record<UploadStage, string> = {
  QUEUED: "Waiting to upload",
  UPLOADING: "Uploading file…",
  UPLOADED: "Uploaded — waiting for Start Valuation",
  PROCESSING: "Extracting document text…",
  READY: "Document text extracted",
  FAILED: "Upload or document processing failed",
};

export function ValuationWorkspace({ profile, onSignOut }: { profile: any; onSignOut: () => void }) {
  const supabase = createSupabaseBrowserClient();
  const [valuations, setValuations] = useState<any[]>([]);
  const [valuationHistoryLoading, setValuationHistoryLoading] = useState(true);
  const [valuation, setValuation] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [otherDocumentTypes, setOtherDocumentTypes] = useState("");
  const [uploadStatus, setUploadStatus] = useState<Record<string, UploadEntry[]>>({});
  const [extracting, setExtracting] = useState(false);
  const [newValuationMode, setNewValuationMode] = useState(false);
  const [newValuationName, setNewValuationName] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [reviewData, setReviewData] = useState<any>(null);
  const [valuationPhase, setValuationPhase] = useState<ValuationPhase | null>(null);
  const [discardingExtraction, setDiscardingExtraction] = useState(false);
  const [reportDownloadUrl, setReportDownloadUrl] = useState("");
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress>({
    phase: "PREPARING",
    title: "Preparing uploaded documents",
    detail: "ValuerAI is preparing the secure files for document text extraction.",
    completed: 0,
    total: 0,
    percent: 8,
  });
  const creationInFlight = useRef(false);
  const extractionInFlight = useRef(false);
  const extractionCancelled = useRef(false);
  const extractionRequestController = useRef<AbortController | null>(null);

  const stateName = useMemo(
    () => INDIA_STATE_OPTIONS.find(([code]) => code === profile.state_code)?.[1] ?? "State unavailable",
    [profile.state_code],
  );

  const api = async (url: string, init?: RequestInit) => {
    const request = { ...init, cache: "no-store" as RequestCache };
    let response = await fetch(url, request);
    if (response.status === 401) {
      // Allow the browser client to finish any in-flight automatic refresh,
      // then retry once with the updated cookie. A failed history request must
      // never destroy an otherwise recoverable login session.
      const { data, error } = await supabase.auth.getSession();
      if (!error && data.session) response = await fetch(url, request);
    }
    if (response.status === 401) {
      throw Error("Your session could not be verified. Refresh the page and try again. You have not been signed out.");
    }
    const rawBody = await response.text();
    let body: any = {};
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        if (response.status === 504) {
          throw Error("AI processing exceeded the available server time. Please retry this valuation; the uploaded documents have been retained.");
        }
        throw Error(response.ok ? "The server returned an invalid response." : `Request failed with status ${response.status}.`);
      }
    }
    if (!response.ok) throw Error(body.error || `Request failed with status ${response.status}.`);
    return body;
  };

  const loadList = async () => {
    setValuationHistoryLoading(true);
    setMessage("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      setValuations((await api("/api/valuations", { signal: controller.signal })).valuations || []);
    } catch (error: any) {
      if (error?.name === "AbortError") {
        setMessage("Valuation history is taking longer than expected. Please refresh the page and try again.");
        return;
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
      setValuationHistoryLoading(false);
    }
  };

  const open = async (id: string) => {
    setBusy(true);
    try {
      const loadedValuation = (await api(`/api/valuations/${id}`)).valuation;
      setValuation(loadedValuation);
      setExtracting(loadedValuation.status === "EXTRACTING");
      setCustomInstructions(loadedValuation.custom_instructions || "");
      const editableData = loadedValuation.approved_data || loadedValuation.extraction_data;
      setReviewData(editableData && Object.keys(editableData).length ? normalizeExtractionResult(editableData) : null);
    } catch (error: any) {
      setMessage(error.message);
      setValuationHistoryLoading(false);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const valuationId = searchParams.get("valuation");
    if (valuationId) void open(valuationId);
    else if (searchParams.get("new") === "1") setNewValuationMode(true);
    else void loadList().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if ((!extracting && valuation?.status !== "EXTRACTING") || !valuation?.id) return;
    let stopped = false;
    let polling = false;

    async function refreshExtractionProgress() {
      if (polling || document.visibilityState !== "visible") return;
      polling = true;
      try {
        const current = (await api(`/api/valuations/${valuation.id}/extraction-status`)).extraction;
        if (stopped) return;
        const total = current.documentCount || valuation.valuation_documents?.length || 0;
        const completed = current.completedDocuments || 0;

        if (current.phase === "COMPLETE") {
          setExtractionProgress({ phase: "REVIEW", title: "Extraction complete", detail: "Opening the extracted-data review screen.", completed: total, total, percent: 100 });
          setBusy(false);
          extractionInFlight.current = false;
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          if (!stopped) {
            await open(valuation.id);
            setMessage("Extraction complete. Review the extracted data and confirm when ready.");
          }
        } else if (current.phase === "FAILED") {
          setBusy(false);
          extractionInFlight.current = false;
          await open(valuation.id);
          setMessage(current.error || "Extraction failed. Your uploaded documents have been retained; select Start Valuation to retry.");
        } else if (current.phase === "DOCUMENT_READING") {
          setExtractionProgress({
            phase: "OCR",
            title: "Document text extraction in progress",
            detail: current.activeDocuments > 1 ? "Reading two uploaded documents in parallel." : "Reading the next uploaded document.",
            completed,
            total,
            percent: Math.min(76, 15 + Math.round((completed / Math.max(total, 1)) * 60)),
          });
        } else if (current.phase === "STRUCTURED_EXTRACTION") {
          setExtractionProgress({ phase: "AI", title: "AI extraction in progress", detail: `Analysing the combined document text and applying the published state rules${current.model ? ` with ${current.model}` : ""}.`, completed, total, percent: 84 });
        } else if (current.phase === "POST_PROCESSING") {
          setExtractionProgress({ phase: "AI", title: "Validating extracted information", detail: "Normalising the extracted fields and checking document consistency.", completed, total, percent: 93 });
        } else {
          setExtractionProgress({ phase: "PREPARING", title: "Preparing uploaded documents", detail: "Validating the secure files before document text extraction begins.", completed, total, percent: 10 });
        }
      } catch {
        // A temporary status-poll failure does not stop the durable background run.
      } finally {
        polling = false;
      }
    }

    void refreshExtractionProgress();
    const timer = window.setInterval(() => void refreshExtractionProgress(), 3000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshExtractionProgress();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [extracting, valuation?.id, valuation?.status]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const valuationName = newValuationName.trim();
    if (!valuationName || creationInFlight.current) return;
    creationInFlight.current = true;
    setBusy(true);
    setMessage("");
    setUploadStatus({});
    setOtherDocumentTypes("");
    try {
      const result = await api("/api/valuations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyLabel: valuationName }),
      });
      window.history.replaceState({}, "", `/?valuation=${result.valuation.id}`);
      setValuation({ ...result.valuation, valuation_documents: [], valuation_calculations: [], reports: [] });
      setCustomInstructions("");
      setNewValuationMode(false);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      creationInFlight.current = false;
      setBusy(false);
    }
  }

  function updateUploadEntry(kind: string, id: string, update: Partial<UploadEntry>) {
    setUploadStatus((current) => ({
      ...current,
      [kind]: (current[kind] || []).map((entry) => entry.id === id ? { ...entry, ...update } : entry),
    }));
  }

  async function upload(kind: string, event: ChangeEvent<HTMLInputElement>) {
    if (!valuation) return;
    const input = event.currentTarget;
    const files = [...(input.files || [])];
    if (!files.length) return;
    if (kind === "OTHER" && !otherDocumentTypes.trim()) {
      setMessage("Enter the comma-separated document type or name inside the Other documents section before selecting files.");
      input.value = "";
      return;
    }

    const entries = files.map((file, index) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${index}-${Date.now()}`,
      name: file.name,
      stage: "QUEUED" as UploadStage,
    }));
    setUploadStatus((current) => ({ ...current, [kind]: [...(current[kind] || []), ...entries] }));
    setBusy(true);
    setMessage("");
    const failures: string[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const entry = entries[index];
      try {
        updateUploadEntry(kind, entry.id, { stage: "UPLOADING" });
        const types = kind === "OTHER"
          ? otherDocumentTypes.split(",").map((value) => value.trim()).filter(Boolean)
          : [];
        const signed = await api(`/api/valuations/${valuation.id}/documents/sign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            filename: file.name,
            mimeType: file.type,
            byteSize: file.size,
            otherDocumentTypes: types,
          }),
        });
        const uploaded = await fetch(signed.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type, "x-upsert": "false" },
          body: file,
        });
        if (!uploaded.ok) throw Error(`Upload failed: ${file.name}`);

        const completed = await api(`/api/valuations/${valuation.id}/documents/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            path: signed.path,
            filename: file.name,
            mimeType: file.type,
            byteSize: file.size,
            otherDocumentTypes: types,
          }),
        });
        updateUploadEntry(kind, entry.id, { stage: "UPLOADED", documentId: completed.document.id });
      } catch (error: any) {
        const errorMessage = error.message || "Upload failed.";
        failures.push(`${file.name}: ${errorMessage}`);
        updateUploadEntry(kind, entry.id, { stage: "FAILED", error: errorMessage });
      }
    }

    await open(valuation.id);
    setMessage(failures.length
      ? `Some files could not be completed: ${failures.join(" ")}`
      : "Selected files were uploaded. Document text will be extracted only after Start Valuation is clicked.");
    setBusy(false);
    input.value = "";
  }

  async function extract() {
    if (!valuation || busy || extractionInFlight.current) return;
    const confirmed = window.confirm("Start AI extraction using the documents currently uploaded for this valuation?");
    if (!confirmed) return;

    extractionInFlight.current = true;
    extractionCancelled.current = false;
    setBusy(true);
    setExtracting(true);
    setMessage("");
    try {
      await saveCustomInstructions();
    } catch (error: any) {
      setMessage(error.message);
      setExtracting(false);
      setBusy(false);
      extractionInFlight.current = false;
      return;
    }

    setExtractionProgress({
      phase: "PREPARING",
      title: "Preparing uploaded documents",
      detail: "ValuerAI is preparing the secure files for document text extraction.",
      completed: 0,
      total: valuation.valuation_documents?.length || 0,
      percent: 8,
    });
    setUploadStatus((current) => Object.fromEntries(Object.entries(current).map(([kind, entries]) => [kind, entries.map((entry) => entry.stage === "UPLOADED" ? { ...entry, stage: "PROCESSING" as UploadStage } : entry)])));
    setMessage("Document text extraction and AI valuation extraction are in progress. Please keep this page open.");
    const controller = new AbortController();
    extractionRequestController.current = controller;
    let backgroundProcessing = false;
    try {
      const result = await api(`/api/valuations/${valuation.id}/extract`, { method: "POST", signal: controller.signal });
      if (result.processing) {
        backgroundProcessing = true;
        setValuation((current: any) => current ? { ...current, status: "EXTRACTING", processing_error: null } : current);
        setMessage("Background document reading and AI extraction are in progress. Progress is saved automatically, so this valuation can be reopened later.");
        return;
      }
      setExtractionProgress({ phase: "REVIEW", title: "Extraction complete", detail: "Preparing the editable review form.", completed: valuation.valuation_documents?.length || 0, total: valuation.valuation_documents?.length || 0, percent: 100 });
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      await open(valuation.id);
      setMessage("Extraction complete. Review the extracted data and confirm when ready.");
    } catch (error: any) {
      if (extractionCancelled.current) return;
      setUploadStatus({});
      await open(valuation.id);
      setMessage(error.message);
    } finally {
      if (extractionRequestController.current === controller) extractionRequestController.current = null;
      if (!backgroundProcessing) setExtracting(false);
      if (!extractionCancelled.current) setBusy(false);
      extractionInFlight.current = false;
    }
  }

  async function cancelExtraction() {
    if (!valuation || extractionCancelled.current) return;
    if (!confirm("Cancel the current extraction and return to document upload? Your uploaded files will be retained.")) return;

    extractionCancelled.current = true;
    extractionRequestController.current?.abort();
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/valuations/${valuation.id}/reset?preserveDocuments=true`, { method: "POST" });
      setExtracting(false);
      setUploadStatus({});
      setReviewData(null);
      await open(valuation.id);
      setMessage("Extraction was cancelled. Your uploaded documents have been retained.");
    } catch (error: any) {
      setMessage(error.message);
      await open(valuation.id);
    } finally {
      setBusy(false);
    }
  }

  async function saveCustomInstructions() {
    if (!valuation) return;
    const result = await api(`/api/valuations/${valuation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customInstructions }),
    });
    setValuation((current: any) => current ? { ...current, custom_instructions: result.customInstructions } : current);
  }

  async function removeDocument(documentId: string, kind: string, localEntryId?: string) {
    if (!valuation || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/valuations/${valuation.id}/documents/${documentId}`, { method: "DELETE" });
      setUploadStatus((current) => ({
        ...current,
        [kind]: (current[kind] || []).filter((entry) => entry.id !== localEntryId && entry.documentId !== documentId),
      }));
      await open(valuation.id);
      setMessage("The selected file was removed.");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!confirm("Discard documents and extracted data?")) return;
    setBusy(true);
    setDiscardingExtraction(true);
    setMessage("");
    try {
      await api(`/api/valuations/${valuation.id}/reset`, { method: "POST" });
      setUploadStatus({});
      setOtherDocumentTypes("");
      setReviewData(null);
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      await open(valuation.id);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setDiscardingExtraction(false);
      setBusy(false);
    }
  }

  async function proceedWithValuation() {
    if (!valuation || !reviewData || busy) return;
    setBusy(true);
    setMessage("");
    setValuationPhase("APPROVING");
    try {
      await api(`/api/valuations/${valuation.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewData),
      });
      setValuationPhase("VALUING");
      await api(`/api/valuations/${valuation.id}/calculate`, { method: "POST" });
      setValuationPhase("REPORTING");
      const generated = await api(`/api/valuations/${valuation.id}/report`, { method: "POST" });
      setReportDownloadUrl(generated.downloadUrl);
      setValuationPhase("COMPLETE");
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      await open(valuation.id);
    } catch (error: any) {
      await open(valuation.id);
      setMessage(error.message);
    } finally {
      setValuationPhase(null);
      setBusy(false);
    }
  }

  async function generateReport() {
    if (!valuation || busy) return;
    setBusy(true);
    setMessage("");
    setValuationPhase("REPORTING");
    try {
      const generated = await api(`/api/valuations/${valuation.id}/report`, { method: "POST" });
      setReportDownloadUrl(generated.downloadUrl);
      setValuationPhase("COMPLETE");
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      await open(valuation.id);
      const download = document.createElement("a");
      download.href = generated.downloadUrl;
      download.download = `${valuation.reference_no}.docx`;
      document.body.appendChild(download);
      download.click();
      download.remove();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setValuationPhase(null);
      setBusy(false);
    }
  }

  async function cancelValuation() {
    if (!valuation || busy) return;
    if (!confirm("Cancel this valuation? All uploaded files and extracted document text will be permanently removed.")) return;
    setBusy(true);
    try {
      await api(`/api/valuations/${valuation.id}/reset?discard=true`, { method: "POST" });
      setValuation(null);
      setUploadStatus({});
      setOtherDocumentTypes("");
      setCustomInstructions("");
      await loadList();
      setMessage("The valuation was cancelled and its uploaded files were removed.");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function persistedDocuments(kind: string) {
    const localNames = new Set((uploadStatus[kind] || []).map((entry) => entry.name));
    return (valuation?.valuation_documents || []).filter(
      (document: any) => document.kind === kind && !localNames.has(document.original_filename),
    );
  }

  function persistedStage(document: any): UploadStage {
    if (document.ocr_text) return "READY";
    if (document.processing_metadata?.ocrStatus === "FAILED") return "FAILED";
    if (extracting || document.processing_metadata?.ocrStatus === "RUNNING") return "PROCESSING";
    return "UPLOADED";
  }

  const uploadedKinds = new Set((valuation?.valuation_documents || []).map((document: any) => document.kind));
  const mandatoryDocumentsUploaded = uploadedKinds.has("SALE_DEED");

  const formatStartDate = (value: string) => new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
  const formatStartTime = (value: string) => new Date(value).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <main className={`app-shell${valuation ? " valuation-page-shell" : ""}`}>
      <aside className="side-nav">
        <a className="logo" href="/"><span className="logo-mark">V</span><span>Valuer<span>AI</span></span></a>
        <p className="jurisdiction"><b>{stateName}</b></p>
        <div className="side-footer">
          <div className="avatar">{profile.display_name[0]}</div>
          <div><b>{profile.display_name}</b><small>Valuation workspace</small></div>
          <button className="text-button" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>

      <section className="content">
        {!valuation ? (
          newValuationMode ? (
            <div className="new-valuation-shell">
              {busy ? (
                <div className="workspace-loader" role="status" aria-live="polite">
                  <span className="loading-logo">V</span>
                  <span className="loading-ring" />
                  <h1>Preparing your valuation workspace</h1>
                  <p>Creating the valuation securely. Please wait.</p>
                </div>
              ) : (
                <div className="panel valuation-name-panel">
                  <p className="eyebrow">NEW VALUATION</p>
                  <h1>Name this valuation</h1>
                  <p className="muted">Enter a clear and distinctive name so you can identify this valuation easily in your history.</p>
                  {message && <p className="notice">{message}</p>}
                  <form onSubmit={(event) => void create(event)}>
                    <label className="label">Valuation Name *
                      <input
                        name="valuationName"
                        required
                        maxLength={200}
                        autoFocus
                        value={newValuationName}
                        onChange={(event) => setNewValuationName(event.target.value)}
                        placeholder="For example: Sharma Residence, Agartala"
                      />
                    </label>
                    <div className="valuation-name-actions">
                      <a className="button secondary button-link" href="/">Cancel</a>
                      <button className="button primary" disabled={!newValuationName.trim()}>Continue to document upload</button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ) : <>
            <header className="topbar">
              <div><p className="eyebrow">YOUR VALUATION WORKSPACE</p><h1>Welcome {profile.display_name}!</h1></div>
              <a className="button primary button-link" href="/?new=1" target="_blank" rel="noopener noreferrer">+ Start new valuation</a>
            </header>
            {message && <p className="notice">{message}</p>}
            <div className="panel valuation-history-panel">
              <div className="valuation-history-heading">
                <h2>Valuation history</h2>
                {valuationHistoryLoading && <span role="status" aria-live="polite">Loading records…</span>}
              </div>
              <table aria-busy={valuationHistoryLoading}>
                <thead><tr><th>Reference</th><th>Valuation Name</th><th>Valuation start date</th><th>Valuation start time</th><th>Status</th><th>Report</th></tr></thead>
                <tbody>
                  {valuationHistoryLoading
                    ? Array.from({ length: 4 }, (_, row) => (
                        <tr className="valuation-history-skeleton" key={`valuation-history-skeleton-${row}`} aria-hidden="true">
                          {Array.from({ length: 6 }, (_, column) => <td key={column}><span /></td>)}
                        </tr>
                      ))
                    : valuations.map((item) => <tr key={item.id}><td><a className="valuation-reference" href={`/?valuation=${item.id}`} target="_blank" rel="noopener noreferrer">{item.reference_no}</a></td><td>{item.property_label || "Unnamed valuation"}</td><td>{formatStartDate(item.created_at)}</td><td>{formatStartTime(item.created_at)}</td><td>{item.status.replaceAll("_", " ")}</td><td>{item.reports?.length ? <a className="valuation-reference" href={`/api/valuations/${item.id}/report`}>Download .docx</a> : "Not available"}</td></tr>)}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <button className="text-button" onClick={() => { setValuation(null); void loadList(); }}>Back to valuations</button>
            <header className="topbar"><div><p className="eyebrow">{valuation.reference_no}</p><h1>{valuation.property_label || "New valuation"}</h1></div></header>
            {message && !extracting && !valuationPhase && !discardingExtraction && <p className="notice">{message}</p>}

            {extracting && <ExtractionProgressPanel progress={extractionProgress} onCancel={() => void cancelExtraction()} busy={busy && extractionCancelled.current} />}
            {valuationPhase && <ValuationProgressPanel phase={valuationPhase} />}
            {discardingExtraction && <WorkspaceTransition title="Discarding extracted data" detail="Removing uploaded documents and preparing a clean valuation workspace." />}

            {!extracting && !valuationPhase && !discardingExtraction && ["DRAFT", "UPLOADING"].includes(valuation.status) && (
              <div className="panel">
                <div className="panel-heading">
                  <div><h2>Upload documents</h2><p>Files are stored securely when uploaded. Document text extraction starts only after you click Start Valuation.</p></div>
                </div>
                <div className="upload-grid">
                  {documents.map(([kind, label]) => {
                    const localEntries = uploadStatus[kind] || [];
                    const savedEntries = persistedDocuments(kind);
                    return (
                      <div className="upload-card" key={kind}>
                        <label className="upload-select" htmlFor={`upload-${kind}`}>
                          <span className="upload-icon">↑</span>
                          <b>{label}{kind === "SALE_DEED" && <span className="mandatory-mark"> *</span>}</b>
                          <small>{kind === "OTHER" ? "Select one or more files" : "PDF, DOC, DOCX or image"}</small>
                          <input id={`upload-${kind}`} type="file" multiple={kind === "OTHER"} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={(event) => void upload(kind, event)} />
                        </label>
                        {kind === "OTHER" && (
                          <input
                            className="other-input"
                            value={otherDocumentTypes}
                            onChange={(event) => setOtherDocumentTypes(event.target.value)}
                            placeholder="Document type/name, comma-separated"
                            aria-label="Other document type or name"
                          />
                        )}
                        <div className="upload-status-list" aria-live="polite">
                          {!localEntries.length && !savedEntries.length && <p className="upload-empty">No file selected</p>}
                          {savedEntries.map((document: any) => {
                            const stage = persistedStage(document);
                            return <div className={`upload-file-status status-${stage.toLowerCase()}`} key={document.id}><span /><div><strong>{document.original_filename}</strong><small>{uploadStageLabel[stage]}</small></div><button type="button" className="remove-upload" disabled={busy} aria-label={`Remove ${document.original_filename}`} title="Remove file" onClick={() => void removeDocument(document.id, kind)}>×</button></div>;
                          })}
                          {localEntries.map((entry) => <div className={`upload-file-status status-${entry.stage.toLowerCase()}`} key={entry.id}><span /><div><strong>{entry.name}</strong><small>{entry.error || uploadStageLabel[entry.stage]}</small></div>{entry.documentId && <button type="button" className="remove-upload" disabled={busy} aria-label={`Remove ${entry.name}`} title="Remove file" onClick={() => void removeDocument(entry.documentId!, kind, entry.id)}>×</button>}</div>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <label className="custom-instructions-field">
                  <span>Custom Instructions to agent <small>(Optional)</small></span>
                  <textarea
                    value={customInstructions}
                    maxLength={4000}
                    disabled={busy}
                    onChange={(event) => setCustomInstructions(event.target.value)}
                    onBlur={() => void saveCustomInstructions().catch((error) => setMessage(error.message))}
                    placeholder="Add relevant processing context, such as relationships between uploaded documents, unavailable supporting records, or verified details supplied separately."
                  />
                  <small>Provide any additional document context or special guidance for the Extraction and Valuation Engines. These instructions cannot override published rules or verified document evidence.</small>
                  <small className="instruction-count">{customInstructions.length}/4000</small>
                </label>
                {!mandatoryDocumentsUploaded && <p className="mandatory-note">* A Sale Deed must be uploaded before valuation can start.</p>}
                <div className="action-row upload-actions">
                  <button className="button primary" disabled={busy || !mandatoryDocumentsUploaded} onClick={() => void extract()}>{busy ? "Please wait…" : "Start Valuation"}</button>
                  <button className="button danger" disabled={busy} onClick={() => void cancelValuation()}>Cancel valuation</button>
                </div>
              </div>
            )}

            {!valuationPhase && !discardingExtraction && valuation.status === "REVIEW_REQUIRED" && reviewData && <ExtractedDataReview data={reviewData} onChange={setReviewData} onProceed={() => void proceedWithValuation()} onDiscard={() => void reset()} busy={busy} />}

            {!extracting && !valuationPhase && !discardingExtraction && valuation.status === "EXTRACTING" && (
              <ExtractionProgressPanel
                progress={{ phase: "AI", title: "Valuation extraction in progress", detail: "ValuerAI is processing the uploaded documents and preparing structured valuation data.", completed: 0, total: valuation.valuation_documents?.length || 0, percent: 70 }}
                onCancel={() => void cancelExtraction()}
                busy={busy && extractionCancelled.current}
              />
            )}

            {!valuationPhase && !discardingExtraction && valuation.status === "VALUING" && <ValuationProgressPanel phase="VALUING" onRefresh={() => void open(valuation.id)} />}

            {!valuationPhase && !discardingExtraction && valuation.status === "COMPLETE" && (
              <section className="panel valuation-complete-panel">
                <span className="completion-mark">✓</span>
                <p className="eyebrow">VALUATION COMPLETE</p>
                <h2>Your valuation document is ready</h2>
                <p className="muted">The editable Word report is stored securely with this valuation and remains available from Valuation History.</p>
                <div className="completion-actions">
                  {valuation.reports?.length ? <a className="button primary button-link" href={reportDownloadUrl || `/api/valuations/${valuation.id}/report`}>Download valuation report (.docx)</a> : <button className="button primary" onClick={() => void generateReport()}>Generate valuation document</button>}
                  <button className="button secondary" onClick={() => window.close()}>Close Valuation</button>
                </div>
              </section>
            )}

            {!["DRAFT", "UPLOADING", "REVIEW_REQUIRED", "EXTRACTING", "VALUING", "COMPLETE"].includes(valuation.status) && (
              <div className="panel"><h2>Valuation status: {valuation.status.replaceAll("_", " ")}</h2><p className="muted">This valuation has been reopened at its latest saved execution status.</p>{valuation.processing_error && <p className="notice">{valuation.processing_error}</p>}</div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function ExtractionProgressPanel({ progress, onCancel, busy = false }: { progress: ExtractionProgress; onCancel?: () => void; busy?: boolean }) {
  const steps: Array<{ key: ExtractionPhase; label: string }> = [
    { key: "OCR", label: "Document text" },
    { key: "AI", label: "AI extraction" },
    { key: "REVIEW", label: "Review data" },
  ];
  const order: ExtractionPhase[] = ["PREPARING", "OCR", "AI", "REVIEW"];
  const activeIndex = order.indexOf(progress.phase);

  return (
    <section className="panel extraction-progress-panel" role="status" aria-live="polite">
      <div className="extraction-progress-visual">
        <div className="extraction-orbit"><span className="logo-mark">V</span><i /><i /></div>
        <strong>{progress.percent}%</strong>
      </div>
      <div className="extraction-progress-copy">
        <p className="eyebrow">START VALUATION</p>
        <h2>{progress.title}</h2>
        <p>{progress.detail}</p>
        {progress.total > 0 && <p className="extraction-count">{progress.completed} of {progress.total} document{progress.total === 1 ? "" : "s"} transcribed</p>}
        <div className="extraction-progress-bar" aria-hidden="true"><span style={{ width: `${progress.percent}%` }} /></div>
        <div className="extraction-steps">
          {steps.map((step) => {
            const stepIndex = order.indexOf(step.key);
            const state = stepIndex < activeIndex ? "complete" : step.key === progress.phase || (progress.phase === "PREPARING" && step.key === "OCR") ? "active" : "pending";
            return <div className={`extraction-step ${state}`} key={step.key}><span>{state === "complete" ? "✓" : ""}</span><small>{step.label}</small></div>;
          })}
        </div>
        <p className="extraction-wait-note">Progress is saved automatically. You may leave this tab and reopen the valuation later.</p>
        {onCancel && <button className="button danger" disabled={busy} onClick={onCancel}>{busy ? "Cancelling…" : "Cancel"}</button>}
      </div>
    </section>
  );
}

function ExtractedDataReview({ data, onChange, onProceed, onDiscard, busy }: { data: any; onChange: (data: any) => void; onProceed: () => void; onDiscard: () => void; busy: boolean }) {
  const extractionResult = data.extraction_result;
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(EXTRACTION_GROUPS.slice(0, 2).map((group) => group.key)));
  const updateFieldValue = (groupKey: string, fieldKey: string, value: unknown) => {
    const next = structuredClone(data);
    const field = next.extraction_result[groupKey][fieldKey];
    if (field.source_document !== "User-reviewed input" && field.value !== null && field.value !== undefined && field.value !== "") {
      field.alternative_values = [...(field.alternative_values || []), {
        value: field.value,
        source_document: field.source_document,
        source_page_or_section: field.source_page_or_section,
        confidence: field.confidence,
        remarks: field.remarks,
      }];
    }
    field.value = value === "" ? null : value;
    field.source_document = "User-reviewed input";
    field.source_page_or_section = null;
    field.confidence = null;
    field.remarks = "Value reviewed or amended by the user before valuation.";
    onChange(next);
  };
  const warnings = extractionResult.validation_warnings || [];
  const missingRequiredFields = extractionResult.missing_required_fields || [];

  return (
    <section className="review-layout extracted-review">
      <div className="panel review-form-panel">
        <div className="panel-heading"><div><p className="eyebrow">HUMAN REVIEW</p><h2>Review extracted data</h2><p>Every field in the minimum extraction map is shown below. Blank fields mean the information was not found and may be completed manually before valuation.</p></div><span className="badge warn">Editable values</span></div>

        <div className="extraction-contract-groups">
          {EXTRACTION_GROUPS.map((group) => {
            const populated = group.fields.filter((field) => extractionResult[group.key][field.key].value !== null && extractionResult[group.key][field.key].value !== "").length;
            return <details className="extraction-contract-group" open={openGroups.has(group.key)} onToggle={(event) => {
              const isOpen = event.currentTarget.open;
              setOpenGroups((current) => {
                if (current.has(group.key) === isOpen) return current;
                const next = new Set(current);
                if (isOpen) next.add(group.key); else next.delete(group.key);
                return next;
              });
            }} key={group.key}>
              <summary><span><strong>{group.label}</strong><small>{group.description}</small></span><b>{populated}/{group.fields.length} found</b></summary>
              <div className="form-grid extraction-contract-fields">
                {group.fields.map((field) => <ReviewContractField
                  key={field.key}
                  definition={field}
                  field={extractionResult[group.key][field.key]}
                  onChange={(value) => updateFieldValue(group.key, field.key, value)}
                />)}
              </div>
            </details>;
          })}
        </div>

        <div className="review-actions"><button className="button danger" disabled={busy} onClick={onDiscard}>Discard Extraction and Reupload Documents</button><button className="button primary" disabled={busy} onClick={onProceed}>Proceed with valuation</button></div>
      </div>

      <aside className="panel ai-feedback-panel">
        <p className="eyebrow">AI FEEDBACK</p><h2>Review notes</h2><p className="muted">These observations are retained as generated and cannot be edited.</p>
        <FeedbackGroup title="Missing report-critical fields" items={missingRequiredFields} empty="No report-critical fields were identified as missing." />
        <FeedbackGroup title="Validation warnings and contradictions" items={warnings.map((item: any) => `${item.field}: ${item.description}`)} empty="No contradictions identified." tone="contradiction" />
      </aside>
    </section>
  );
}

function ReviewContractField({ definition, field, onChange }: { definition: { label: string; kind?: ExtractionFieldKind; hint?: string }; field: any; onChange: (value: unknown) => void }) {
  const kind = definition.kind || "text";
  const provenance = [field.source_document, field.source_page_or_section].filter(Boolean).join(" - ");
  return <label className={`review-field extraction-contract-field${kind === "long_text" ? " full-field" : ""}`}>
    <span>{definition.label}</span>
    {kind === "boolean" ? (
      <select value={field.value === null || field.value === undefined ? "" : String(field.value)} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")}>
        <option value="">Not found / not available</option><option value="true">Yes</option><option value="false">No</option>
      </select>
    ) : kind === "long_text" ? (
      <textarea value={field.value ?? ""} onChange={(event) => onChange(event.target.value)} />
    ) : (
      <input type={kind === "number" ? "number" : "text"} step={kind === "number" ? "any" : undefined} value={field.value ?? ""} onChange={(event) => onChange(event.target.value)} />
    )}
    {definition.hint && <small>{definition.hint}</small>}
    <span className="field-provenance">
      {provenance ? <>Source: {provenance}{field.confidence && <> | Confidence: {String(field.confidence).toLowerCase()}</>}</> : "No source identified"}
      {field.remarks && <em>{field.remarks}</em>}
      {field.alternative_values?.length > 0 && <em>{field.alternative_values.length} alternative source value{field.alternative_values.length === 1 ? "" : "s"} retained for review.</em>}
    </span>
  </label>;
}

function FeedbackGroup({ title, items, empty, tone = "" }: { title: string; items: string[]; empty: string; tone?: string }) {
  return <div className={`feedback-group ${tone}`}><h3>{title}</h3>{items.length ? items.map((item, index) => <p key={index}>{item}</p>) : <p className="empty-review">{empty}</p>}</div>;
}

function ValuationProgressPanel({ phase, onRefresh }: { phase: ValuationPhase; onRefresh?: () => void }) {
  const phases: Array<{ key: ValuationPhase; label: string; title: string; detail: string; percent: number }> = [
    { key: "APPROVING", label: "Approve data", title: "Confirming reviewed information", detail: "Saving your corrections and locking the approved factual dataset.", percent: 18 },
    { key: "VALUING", label: "Valuation Engine", title: "Valuation Engine in progress", detail: "Applying published state rules and preparing deterministic valuation inputs.", percent: 55 },
    { key: "REPORTING", label: "Word report", title: "Generating valuation document", detail: "Creating and securely storing the editable Word valuation report.", percent: 84 },
    { key: "COMPLETE", label: "Complete", title: "Valuation document completed", detail: "Preparing the secure download link.", percent: 100 },
  ];
  const currentIndex = phases.findIndex((item) => item.key === phase);
  const current = phases[currentIndex];
  return <section className="panel extraction-progress-panel valuation-progress-panel" role="status" aria-live="polite"><div className="extraction-progress-visual"><div className="extraction-orbit"><span className="logo-mark">V</span><i /><i /></div><strong>{current.percent}%</strong></div><div className="extraction-progress-copy"><p className="eyebrow">VALUATION WORKFLOW</p><h2>{current.title}</h2><p>{current.detail}</p><div className="extraction-progress-bar"><span style={{ width: `${current.percent}%` }} /></div><div className="valuation-progress-steps">{phases.map((item, index) => <div className={`extraction-step ${index < currentIndex ? "complete" : index === currentIndex ? "active" : "pending"}`} key={item.key}><span>{index < currentIndex ? "✓" : ""}</span><small>{item.label}</small></div>)}</div>{onRefresh && <button className="button secondary" onClick={onRefresh}>Refresh status</button>}</div></section>;
}

function WorkspaceTransition({ title, detail }: { title: string; detail: string }) {
  return <section className="panel workspace-transition" role="status" aria-live="polite"><div className="app-loading-brand"><span className="loading-logo">V</span><span className="loading-ring" /></div><h2>{title}</h2><p>{detail}</p><div className="loading-bar"><span /></div></section>;
}
