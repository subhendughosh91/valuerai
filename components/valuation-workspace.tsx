"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
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

type UploadStage = "QUEUED" | "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
type UploadEntry = { id: string; name: string; stage: UploadStage; error?: string };

const uploadStageLabel: Record<UploadStage, string> = {
  QUEUED: "Waiting to upload",
  UPLOADING: "Uploading file…",
  PROCESSING: "Uploaded — extracting document text…",
  READY: "Ready for AI extraction",
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
    void loadList().catch((error) => setMessage(error.message));
  }, []);

  async function create() {
    setBusy(true);
    setMessage("");
    setUploadStatus({});
    setOtherDocumentTypes("");
    try {
      const result = await api("/api/valuations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      await loadList();
      await open(result.valuation.id);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
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

        updateUploadEntry(kind, entry.id, { stage: "PROCESSING" });
        await api(`/api/valuations/${valuation.id}/documents/complete`, {
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
        updateUploadEntry(kind, entry.id, { stage: "READY" });
      } catch (error: any) {
        const errorMessage = error.message || "Upload failed.";
        failures.push(`${file.name}: ${errorMessage}`);
        updateUploadEntry(kind, entry.id, { stage: "FAILED", error: errorMessage });
      }
    }

    await open(valuation.id);
    setMessage(failures.length
      ? `Some files could not be completed: ${failures.join(" ")}`
      : "Selected document upload and text extraction completed.");
    setBusy(false);
    input.value = "";
  }

  async function extract() {
    if (!valuation || busy) return;
    const confirmed = window.confirm("Start AI extraction using the documents currently uploaded for this valuation?");
    if (!confirmed) return;

    setBusy(true);
    setMessage("AI extraction is in progress. Please keep this page open.");
    try {
      await api(`/api/valuations/${valuation.id}/extract`, { method: "POST" });
      await open(valuation.id);
      setMessage("Extraction complete. Review the extracted data and confirm when ready.");
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
    return "PROCESSING";
  }

  return (
    <main className="app-shell">
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
          <>
            <header className="topbar">
              <div><p className="eyebrow">YOUR VALUATION WORKSPACE</p><h1>Welcome {profile.display_name}!</h1></div>
              <button className="button primary" onClick={() => void create()} disabled={busy}>+ Start new valuation</button>
            </header>
            {message && <p className="notice">{message}</p>}
            <div className="panel">
              <h2>Valuation history</h2>
              <table>
                <thead><tr><th>Reference</th><th>Property</th><th>Status</th></tr></thead>
                <tbody>{valuations.map((item) => <tr key={item.id} onClick={() => void open(item.id)}><td><b>{item.reference_no}</b></td><td>{item.property_label || "Property valuation"}</td><td>{item.status.replaceAll("_", " ")}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <button className="text-button" onClick={() => { setValuation(null); void loadList(); }}>Back to valuations</button>
            <header className="topbar"><div><p className="eyebrow">{valuation.reference_no}</p><h1>{valuation.property_label || "New valuation"}</h1></div></header>
            {message && <p className="notice">{message}</p>}

            {valuation.status === "UPLOADING" && (
              <div className="panel">
                <div className="panel-heading">
                  <div><h2>Upload documents</h2><p>Each section shows whether its selected files are uploading, being processed, ready, or failed.</p></div>
                </div>
                <div className="upload-grid">
                  {documents.map(([kind, label]) => {
                    const localEntries = uploadStatus[kind] || [];
                    const savedEntries = persistedDocuments(kind);
                    return (
                      <div className="upload-card" key={kind}>
                        <label className="upload-select" htmlFor={`upload-${kind}`}>
                          <span className="upload-icon">↑</span>
                          <b>{label}</b>
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
                            return <div className={`upload-file-status status-${stage.toLowerCase()}`} key={document.id}><span /><div><strong>{document.original_filename}</strong><small>{uploadStageLabel[stage]}</small></div></div>;
                          })}
                          {localEntries.map((entry) => <div className={`upload-file-status status-${entry.stage.toLowerCase()}`} key={entry.id}><span /><div><strong>{entry.name}</strong><small>{entry.error || uploadStageLabel[entry.stage]}</small></div></div>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="action-row upload-actions">
                  <button className="button primary" disabled={busy} onClick={() => void extract()}>{busy ? "Please wait…" : "Run AI extraction"}</button>
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
          </>
        )}
      </section>
    </main>
  );
}
