"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
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
  const [valuation, setValuation] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [otherDocumentTypes, setOtherDocumentTypes] = useState("");
  const [uploadStatus, setUploadStatus] = useState<Record<string, UploadEntry[]>>({});
  const [extracting, setExtracting] = useState(false);
  const [newValuationMode, setNewValuationMode] = useState(false);
  const [newValuationName, setNewValuationName] = useState("");
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress>({
    phase: "PREPARING",
    title: "Preparing uploaded documents",
    detail: "ValuerAI is preparing the secure files for document text extraction.",
    completed: 0,
    total: 0,
    percent: 8,
  });
  const creationInFlight = useRef(false);

  const stateName = useMemo(
    () => INDIA_STATE_OPTIONS.find(([code]) => code === profile.state_code)?.[1] ?? "State unavailable",
    [profile.state_code],
  );

  const api = async (url: string, init?: RequestInit) => {
    const response = await fetch(url, init);
    const body = await response.json();
    if (!response.ok) throw Error(body.error || "Request failed");
    return body;
  };

  const loadList = async () => setValuations((await api("/api/valuations")).valuations || []);

  const open = async (id: string) => {
    setBusy(true);
    try {
      setValuation((await api(`/api/valuations/${id}`)).valuation);
    } catch (error: any) {
      setMessage(error.message);
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
    if (!extracting || !valuation?.id) return;
    let stopped = false;

    async function refreshExtractionProgress() {
      try {
        const response = await fetch(`/api/valuations/${valuation.id}`);
        if (!response.ok || stopped) return;
        const body = await response.json();
        const currentValuation = body.valuation;
        const currentDocuments = currentValuation?.valuation_documents || [];
        const total = currentDocuments.length;
        const completed = currentDocuments.filter((document: any) => Boolean(document.ocr_text)).length;
        const runningDocument = currentDocuments.find((document: any) => document.processing_metadata?.ocrStatus === "RUNNING");

        if (currentValuation?.status === "REVIEW_REQUIRED") {
          setExtractionProgress({ phase: "REVIEW", title: "Extraction complete", detail: "Opening the extracted-data review screen.", completed, total, percent: 98 });
        } else if (runningDocument) {
          setExtractionProgress({
            phase: "OCR",
            title: "Document text extraction in progress",
            detail: `Reading ${runningDocument.original_filename}`,
            completed,
            total,
            percent: Math.min(76, 15 + Math.round((completed / Math.max(total, 1)) * 60)),
          });
        } else if (total > 0 && completed === total) {
          setExtractionProgress({ phase: "AI", title: "AI extraction in progress", detail: "Analysing the combined document text and applying the published state rules.", completed, total, percent: 86 });
        } else {
          setExtractionProgress({ phase: "PREPARING", title: "Preparing uploaded documents", detail: "Validating the secure files before document text extraction begins.", completed, total, percent: 10 });
        }
      } catch {
        // The extraction request remains authoritative; a temporary status-poll
        // failure should not interrupt processing.
      }
    }

    void refreshExtractionProgress();
    const timer = window.setInterval(() => void refreshExtractionProgress(), 1200);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [extracting, valuation?.id]);

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
    if (!valuation || busy) return;
    const confirmed = window.confirm("Start AI extraction using the documents currently uploaded for this valuation?");
    if (!confirmed) return;

    setBusy(true);
    setExtracting(true);
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
    try {
      await api(`/api/valuations/${valuation.id}/extract`, { method: "POST" });
      await open(valuation.id);
      setMessage("Extraction complete. Review the extracted data and confirm when ready.");
    } catch (error: any) {
      setUploadStatus({});
      await open(valuation.id);
      setMessage(error.message);
    } finally {
      setExtracting(false);
      setBusy(false);
    }
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
    try {
      await api(`/api/valuations/${valuation.id}/reset`, { method: "POST" });
      setUploadStatus({});
      setOtherDocumentTypes("");
      await open(valuation.id);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
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
  const mandatoryDocumentsUploaded = uploadedKinds.has("SALE_DEED") && uploadedKinds.has("KHATIYAN");

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
            <div className="panel">
              <h2>Valuation history</h2>
              <table>
                <thead><tr><th>Reference</th><th>Valuation Name</th><th>Valuation start date</th><th>Valuation start time</th><th>Status</th></tr></thead>
                <tbody>{valuations.map((item) => <tr key={item.id}><td><a className="valuation-reference" href={`/?valuation=${item.id}`} target="_blank" rel="noopener noreferrer">{item.reference_no}</a></td><td>{item.property_label || "Unnamed valuation"}</td><td>{formatStartDate(item.created_at)}</td><td>{formatStartTime(item.created_at)}</td><td>{item.status.replaceAll("_", " ")}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <button className="text-button" onClick={() => { setValuation(null); void loadList(); }}>Back to valuations</button>
            <header className="topbar"><div><p className="eyebrow">{valuation.reference_no}</p><h1>{valuation.property_label || "New valuation"}</h1></div></header>
            {message && !extracting && <p className="notice">{message}</p>}

            {extracting && <ExtractionProgressPanel progress={extractionProgress} />}

            {!extracting && ["DRAFT", "UPLOADING"].includes(valuation.status) && (
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
                          <b>{label}{(kind === "SALE_DEED" || kind === "KHATIYAN") && <span className="mandatory-mark"> *</span>}</b>
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
                {!mandatoryDocumentsUploaded && <p className="mandatory-note">* Sale Deed and Khatiyan must both be uploaded before valuation can start.</p>}
                <div className="action-row upload-actions">
                  <button className="button primary" disabled={busy || !mandatoryDocumentsUploaded} onClick={() => void extract()}>{busy ? "Please wait…" : "Start Valuation"}</button>
                  <button className="button danger" disabled={busy} onClick={() => void cancelValuation()}>Cancel valuation</button>
                </div>
              </div>
            )}

            {valuation.status === "REVIEW_REQUIRED" && (
              <div className="panel">
                <h2>Review extracted data</h2>
                <p className="muted">Edit support and valuation-rate entry are the next UI enhancement. The persisted structured extraction is available below.</p>
                <pre>{JSON.stringify(valuation.extraction_data, null, 2)}</pre>
                <button className="button danger" onClick={() => void reset()}>Reupload documents</button>
              </div>
            )}

            {!extracting && valuation.status === "EXTRACTING" && (
              <ExtractionProgressPanel
                progress={{ phase: "AI", title: "Valuation extraction in progress", detail: "ValuerAI is processing the uploaded documents and preparing structured valuation data.", completed: 0, total: valuation.valuation_documents?.length || 0, percent: 70 }}
                onRefresh={() => void open(valuation.id)}
              />
            )}

            {!["DRAFT", "UPLOADING", "REVIEW_REQUIRED", "EXTRACTING"].includes(valuation.status) && (
              <div className="panel"><h2>Valuation status: {valuation.status.replaceAll("_", " ")}</h2><p className="muted">This valuation has been reopened at its latest saved execution status.</p>{valuation.processing_error && <p className="notice">{valuation.processing_error}</p>}</div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function ExtractionProgressPanel({ progress, onRefresh }: { progress: ExtractionProgress; onRefresh?: () => void }) {
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
        <p className="extraction-wait-note">Please keep this tab open while processing continues.</p>
        {onRefresh && <button className="button secondary" onClick={onRefresh}>Refresh status</button>}
      </div>
    </section>
  );
}
