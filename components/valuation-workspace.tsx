"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

const documents = [["SALE_DEED", "Sale deed"], ["KHATIYAN", "Khatiyan"], ["BUILDING_PLAN", "Building plan"], ["SALE_AGREEMENT", "Sale agreement"], ["RS_HAL_DAG_MAP", "RS Hal Dag no."], ["GOVT_GUIDELINE_RATE", "Govt. guideline land rate"], ["ELECTRICITY_BILL", "Electricity bill"], ["MUNICIPAL_TAX", "Municipal tax document"], ["KYC", "KYC document"], ["OTHER", "Other documents"]] as const;

export function ValuationWorkspace({ profile, onSignOut }: { profile: any; onSignOut: () => void }) {
  const supabase = createSupabaseBrowserClient();
  const [valuations, setValuations] = useState<any[]>([]);
  const [valuation, setValuation] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [otherDocumentTypes, setOtherDocumentTypes] = useState("");
  const api = async (url: string, init?: RequestInit) => { const response = await fetch(url, init); const body = await response.json(); if (!response.ok) throw Error(body.error || "Request failed"); return body; };
  const loadList = async () => setValuations((await api("/api/valuations")).valuations || []);
  const open = async (id: string) => { setBusy(true); try { setValuation((await api(`/api/valuations/${id}`)).valuation); } catch (error: any) { setMessage(error.message); } finally { setBusy(false); } };

  useEffect(() => { void loadList().catch((error) => setMessage(error.message)); }, []);
  useEffect(() => {
    if (!valuation || valuation.status !== "UPLOADING" || valuation.valuation_documents?.every((document: any) => document.ocr_text)) return;
    const timer = setInterval(() => void open(valuation.id), 5000);
    return () => clearInterval(timer);
  }, [valuation?.id, valuation?.status, valuation?.valuation_documents?.length]);

  async function create() { setBusy(true); try { const result = await api("/api/valuations", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); await loadList(); await open(result.valuation.id); } catch (error: any) { setMessage(error.message); } finally { setBusy(false); } }
  async function upload(kind: string, event: React.ChangeEvent<HTMLInputElement>) {
    if (!valuation) return;
    const files = [...event.target.files || []];
    if (kind === "OTHER" && !otherDocumentTypes.trim()) { setMessage("Enter comma-separated Other document type or name before uploading."); return; }
    setBusy(true);
    try {
      for (const file of files) {
        const types = kind === "OTHER" ? otherDocumentTypes.split(",").map((value) => value.trim()).filter(Boolean) : [];
        const signed = await api(`/api/valuations/${valuation.id}/documents/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, filename: file.name, mimeType: file.type, byteSize: file.size, otherDocumentTypes: types }) });
        const uploaded = await fetch(signed.signedUrl, { method: "PUT", headers: { "Content-Type": file.type, "x-upsert": "false" }, body: file });
        if (!uploaded.ok) throw Error(`Upload failed: ${file.name}`);
        await api(`/api/valuations/${valuation.id}/documents/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, path: signed.path, filename: file.name, mimeType: file.type, byteSize: file.size, otherDocumentTypes: types }) });
      }
      await open(valuation.id); setMessage("Documents queued for OCR.");
    } catch (error: any) { setMessage(error.message); } finally { setBusy(false); event.target.value = ""; }
  }
  async function extract() { setBusy(true); try { await api(`/api/valuations/${valuation.id}/extract`, { method: "POST" }); await open(valuation.id); setMessage("Extraction complete. Review the extracted data and confirm when ready."); } catch (error: any) { setMessage(error.message); } finally { setBusy(false); } }
  async function reset() { if (!confirm("Discard documents and extracted data?")) return; setBusy(true); try { await api(`/api/valuations/${valuation.id}/reset`, { method: "POST" }); await open(valuation.id); } catch (error: any) { setMessage(error.message); } finally { setBusy(false); } }
  const ready = valuation?.valuation_documents?.length && valuation.valuation_documents.every((document: any) => document.ocr_text);

  return <main className="app-shell"><aside className="side-nav"><a className="logo" href="/"><span className="logo-mark">V</span><span>Valuer<span>AI</span></span></a><p className="jurisdiction">India / <b>State-aware</b></p><div className="side-footer"><div className="avatar">{profile.display_name[0]}</div><div><b>{profile.display_name}</b><small>Valuation workspace</small></div><button className="text-button" onClick={onSignOut}>Sign out</button></div></aside><section className="content">{!valuation ? <><header className="topbar"><div><p className="eyebrow">YOUR VALUATION WORKSPACE</p><h1>Welcome {profile.display_name}!</h1></div><button className="button primary" onClick={() => void create()} disabled={busy}>+ Start new valuation</button></header>{message && <p className="notice">{message}</p>}<div className="panel"><h2>Valuation history</h2><table><thead><tr><th>Reference</th><th>Property</th><th>Status</th></tr></thead><tbody>{valuations.map((item) => <tr key={item.id} onClick={() => void open(item.id)}><td><b>{item.reference_no}</b></td><td>{item.property_label || "Property valuation"}</td><td>{item.status.replaceAll("_", " ")}</td></tr>)}</tbody></table></div></> : <><button className="text-button" onClick={() => { setValuation(null); void loadList(); }}>Back to valuations</button><header className="topbar"><div><p className="eyebrow">{valuation.reference_no}</p><h1>{valuation.property_label || "New valuation"}</h1></div></header>{message && <p className="notice">{message}</p>}{valuation.status === "UPLOADING" && <div className="panel"><h2>Upload documents</h2><div className="upload-grid">{documents.map(([kind, label]) => <label className="upload-card" key={kind}><b>{label}</b><small>{kind === "OTHER" ? "Multiple files" : "PDF, DOC, DOCX or image"}</small><input type="file" multiple={kind === "OTHER"} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" onChange={(event) => void upload(kind, event)} /></label>)}</div><label className="label">Other document type / name (comma separated)<input value={otherDocumentTypes} onChange={(event) => setOtherDocumentTypes(event.target.value)} /></label><h3>OCR status</h3>{valuation.valuation_documents?.map((document: any) => <p key={document.id}>{document.original_filename}: {document.ocr_text ? "Ready" : "Queued / processing"}</p>)}<button className="button primary" disabled={!ready || busy} onClick={() => void extract()}>Run AI extraction</button></div>}{valuation.status === "REVIEW_REQUIRED" && <div className="panel"><h2>Review extracted data</h2><p className="muted">Edit support and valuation-rate entry are the next UI enhancement. The persisted structured extraction is available below.</p><pre>{JSON.stringify(valuation.extraction_data, null, 2)}</pre><button className="button danger" onClick={() => void reset()}>Reupload documents</button></div>}</>}</section></main>;
}
