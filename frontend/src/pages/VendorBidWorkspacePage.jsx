import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, FileCheck2, FileText,
  Landmark, LoaderCircle, LockKeyhole, Send, Upload, X, Download, Building2,
} from "lucide-react";
import AppShell from "../components/AppShell";
import { apiRequest } from "../services/apiClient";
import { useLanguage } from "../context/LanguageContext";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const STOPWORDS = new Set(["with", "from", "must", "shall", "year", "years", "your", "this", "that", "have", "will", "minimum", "required", "valid", "must"]);

const isTechnicalDoc = (doc) => /technical/i.test(`${doc.documentType || ""} ${doc.originalFilename || ""}`);

function keywordsOf(req) {
  const text = `${req.title || ""} ${req.description || ""}`.toLowerCase();
  return text.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

// Latest non-technical document whose type/filename overlaps the requirement.
function docForRequirement(req, documents) {
  const keys = keywordsOf(req);
  if (!keys.length) return null;
  const pool = [...documents].filter((doc) => !isTechnicalDoc(doc));
  let best = null;
  let bestScore = 0;
  let bestTime = "";
  for (const doc of pool) {
    const hay = `${doc.documentType || ""} ${doc.originalFilename || ""}`.toLowerCase();
    let score = 0;
    for (const k of keys) if (hay.includes(k)) score += 1;
    const when = doc.uploadedAt || doc.createdAt || "";
    if (score > bestScore || (score === bestScore && score > 0 && when > bestTime)) {
      bestScore = score;
      bestTime = when;
      best = doc;
    }
  }
  return bestScore > 0 ? best : null;
}

const dateTimeLabel = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

export default function VendorBidWorkspacePage() {
  const { id: bidId } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const uploadInput = useRef(null);
  const [bid, setBid] = useState(null);
  const [tender, setTender] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadingSlot, setUploadingSlot] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [pendingSlot, setPendingSlot] = useState(null);
  const [gemOpen, setGemOpen] = useState(false);
  const [gemBids, setGemBids] = useState([]);
  const [gemLoading, setGemLoading] = useState(false);
  const [importingId, setImportingId] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const loadedBid = await apiRequest(`/vendor/bids/${bidId}`);
        const tenderId = loadedBid.tenderId;
        const [loadedTender, loadedDocuments] = await Promise.all([
          tenderId ? apiRequest(`/vendor/tenders/${tenderId}`) : Promise.resolve(null),
          apiRequest(`/vendor/bids/${bidId}/documents`),
        ]);
        if (cancelled) return;
        setBid(loadedBid);
        setTender(loadedTender);
        setDocuments(Array.isArray(loadedDocuments) ? loadedDocuments : []);
      } catch (err) {
        if (!cancelled) setError(err.message || t("ws.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [bidId, t]);

  const requirements = useMemo(() => {
    if (Array.isArray(tender?.requirements) && tender.requirements.length > 0) return tender.requirements;
    return [];
  }, [tender]);

  const slotDocs = useMemo(() => {
    const map = {};
    requirements.forEach((req, index) => {
      map[req.id || req._id || `slot-${index}`] = docForRequirement(req, documents);
    });
    return map;
  }, [requirements, documents]);

  const mandatoryRequirements = useMemo(
    () => requirements.filter((req) => req.mandatory !== false),
    [requirements]
  );
  const uploadedRequired = useMemo(
    () => mandatoryRequirements.filter((req, i) => slotDocs[req.id || req._id || `slot-${requirements.indexOf(req)}`] || slotDocs[req.id || req._id || `slot-${i}`]).length,
    [mandatoryRequirements, slotDocs, requirements]
  );
  const technicalDocument = useMemo(() => {
    const techs = documents.filter(isTechnicalDoc);
    techs.sort((a, b) => String(b.uploadedAt || "") < String(a.uploadedAt || "") ? -1 : 1);
    return techs[0] || null;
  }, [documents]);

  const completedItems = uploadedRequired + (technicalDocument ? 1 : 0);
  const requiredItemCount = mandatoryRequirements.length + 1;
  const readyToSubmit = uploadedRequired === mandatoryRequirements.length && Boolean(technicalDocument);
  const progress = requiredItemCount ? Math.round((completedItems / requiredItemCount) * 100) : 0;

  const openFilePicker = (slotKey, docType) => {
    setUploadError("");
    setUploadSuccess("");
    setPendingSlot({ slotKey, docType });
    uploadInput.current?.click();
  };

  const uploadFile = async (event) => {
    const file = event.target.files?.[0];
    const slot = pendingSlot;
    event.target.value = "";
    if (!file || !slot) return;
    const fileName = (file.name || "").toLowerCase();
    const fileType = (file.type || "").toLowerCase();
    const isPdf = fileType === "application/pdf" || fileName.endsWith(".pdf");
    const isImage = fileType.startsWith("image/") || /\.(png|jpg|jpeg|webp|bmp)$/.test(fileName);
    if (!isPdf && !isImage) {
      setUploadError(t("ws.invalidFile"));
      return;
    }
    setUploadingSlot(slot.slotKey);
    setUploadError("");
    setUploadSuccess("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("document_type", slot.docType);
      const token = window.localStorage.getItem("gem_access_token");
      const response = await fetch(`${API_BASE_URL}/vendor/bids/${bidId}/documents`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || t("ws.uploadFailed"));
      }
      const uploaded = await response.json();
      setDocuments((prev) => [...prev, uploaded]);
      setUploadSuccess(t("ws.uploadOk").replace("{file}", file.name));
    } catch (err) {
      setUploadError(err.message || t("ws.uploadFailed"));
    } finally {
      setUploadingSlot("");
      setPendingSlot(null);
    }
  };

  const downloadDoc = async (doc) => {
    try {
      const token = window.localStorage.getItem("gem_access_token");
      const res = await fetch(`${API_BASE_URL}/documents/${doc.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(t("ws.downloadFailed"));
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = doc.originalFilename || "document";
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setUploadError(err.message);
    }
  };

  const toggleGem = async () => {
    const next = !gemOpen;
    setGemOpen(next);
    if (next && gemBids.length === 0 && !gemLoading) {
      try {
        setGemLoading(true);
        const res = await apiRequest("/vendor/gem-bids/demo-ids");
        setGemBids(res.bids || (res.demo_ids || []).map((gid) => ({ id: gid })));
      } catch {
        setGemBids([]);
      } finally {
        setGemLoading(false);
      }
    }
  };

  const importBundle = async (gemId) => {
    try {
      setImportingId(gemId);
      const res = await apiRequest(`/vendor/bids/${bidId}/import-gem`, {
        method: "POST",
        body: JSON.stringify({ gem_bid_id: gemId }),
      });
      const imported = res.imported || [];
      if (imported.length) setDocuments((prev) => [...prev, ...imported]);
      setUploadSuccess(
        imported.length
          ? t("ws.gemImportOk").replace("{n}", imported.length)
          : t("ws.gemAlreadyThere")
      );
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setImportingId("");
    }
  };

  const importAllGem = async () => {
    let list = gemBids;
    if (!list.length) {
      try {
        setGemLoading(true);
        const res = await apiRequest("/vendor/gem-bids/demo-ids");
        list = res.bids || (res.demo_ids || []).map((gid) => ({ id: gid }));
        setGemBids(list);
      } catch {
        list = [];
      } finally {
        setGemLoading(false);
      }
    }
    if (!list.length) {
      setUploadError(t("ws.gemEmpty"));
      return;
    }
    try {
      setImportingId("__all__");
      setUploadError("");
      let total = 0;
      for (const bundle of list) {
        try {
          const res = await apiRequest(`/vendor/bids/${bidId}/import-gem`, {
            method: "POST",
            body: JSON.stringify({ gem_bid_id: bundle.id }),
          });
          const imported = res.imported || [];
          if (imported.length) {
            setDocuments((prev) => [...prev, ...imported]);
            total += imported.length;
          }
        } catch {
          // continue with the next bundle; per-bundle errors surface below
        }
      }
      setUploadSuccess(
        total > 0
          ? t("ws.gemImportOk").replace("{n}", total)
          : t("ws.gemAlreadyThere")
      );
    } finally {
      setImportingId("");
    }
  };

  if (loading) {
    return <AppShell><main className="page-content"><div className="card"><div className="empty-state"><h3>{t("ws.loading")}</h3></div></div></main></AppShell>;
  }
  if (error || !bid) {
    return <AppShell><main className="page-content"><div className="card"><div className="empty-state"><h3>{t("ws.unavailable")}</h3><p>{error}</p><Link to="/vendor/dashboard" className="btn btn-primary">{t("ws.backToBids")}</Link></div></div></main></AppShell>;
  }

  const tenderTitle = tender?.title || t("ws.fallbackTitle");
  const reference = tender?.referenceNumber || bid.bidReference;
  const deadline = tender?.submissionDeadline;

  return (
    <AppShell>
      <main className="ws-page">
        <Link to="/vendor/dashboard" className="ws-back"><ArrowLeft size={16} /> {t("ws.backToBids")}</Link>
        <header className="ws-header">
          <div>
            <span className="ws-eyebrow">{t("ws.eyebrow")}</span>
            <h1>{tenderTitle}</h1>
            <div className="ws-reference">
              <span>{reference}</span>
              <span><FileText size={14} /> {bid.bidReference}</span>
            </div>
          </div>
          <div className="ws-status is-complete">
            <span><CheckCircle2 size={17} /></span>
            <div><small>{t("ws.bidActive")}</small><strong>{t("ws.docsLive")}</strong></div>
          </div>
        </header>

        <section className="ws-overview">
          <div className="ws-overview-copy">
            <span className="ws-eyebrow">{t("ws.progressKicker")}</span>
            <h2>{t("ws.progressTitle")}</h2>
            <p>{t("ws.progressDesc")}</p>
          </div>
          <div className="ws-progress">
            <div><span>{t("ws.ofRequired").replace("{done}", completedItems).replace("{total}", requiredItemCount)}</span><strong>{progress}%</strong></div>
            <i><b style={{ width: `${progress}%` }} /></i>
            <small>{readyToSubmit ? t("ws.readyNote") : t("ws.moreNeeded").replace("{n}", Math.max(requiredItemCount - completedItems, 0))}</small>
          </div>
          <div className="ws-deadline">
            <Clock3 size={18} />
            <div><span>{t("ws.deadline")}</span><strong>{dateTimeLabel(deadline)}</strong></div>
          </div>
        </section>

        <section className="ws-gem">
          <div>
            <span className="ws-eyebrow">{t("ws.gemKicker")}</span>
            <h2>{t("ws.gemTitle")}</h2>
            <p>{t("ws.gemDesc")}</p>
          </div>
          <button type="button" className="btn-trigger-upload" onClick={toggleGem}>
            <Download size={14} /> {t("ws.gemBrowse")}
          </button>
          <button
            type="button"
            className="btn-upload-submit"
            style={{ marginLeft: 8 }}
            disabled={importingId === "__all__"}
            onClick={importAllGem}
          >
            <Download size={14} /> {importingId === "__all__" ? t("ws.importingAll") : t("ws.pullAll")}
          </button>
          {gemOpen && (
            <div style={{ marginTop: 12 }}>
              {gemLoading && <p className="subtext">{t("ws.gemLoading")}</p>}
              {!gemLoading && gemBids.length === 0 && <p className="subtext">{t("ws.gemEmpty")}</p>}
              {!gemLoading && gemBids.map((bundle) => (
                <div key={bundle.id} className="doc-item-pill" style={{ marginBottom: 8 }}>
                  <div className="doc-info font-bold">
                    <span className="mono">{bundle.id}</span>
                    <small>{bundle.seller || ""}{bundle.docs ? ` · ${bundle.docs.length} docs` : ""}</small>
                  </div>
                  <button type="button" disabled={importingId === bundle.id} className="btn-upload-submit" onClick={() => importBundle(bundle.id)}>
                    {importingId === bundle.id ? t("ws.importing") : t("ws.pullHere")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="ws-layout">
          <div className="ws-main-column">
            <section className="ws-documents-card">
              <div className="ws-section-head">
                <div>
                  <span className="ws-eyebrow">{t("ws.stepOne")}</span>
                  <h2>{t("ws.requiredDocs")}</h2>
                  <p>{t("ws.requiredDocsDesc")}</p>
                </div>
                <span>{uploadedRequired}/{mandatoryRequirements.length} {t("ws.complete")}</span>
              </div>
              <div className="ws-document-list">
                {requirements.length ? requirements.map((req, index) => {
                  const slotKey = req.id || req._id || `slot-${index}`;
                  const matched = slotDocs[slotKey] || null;
                  const required = req.mandatory !== false;
                  const busy = uploadingSlot === slotKey;
                  return (
                    <article className={`ws-document-row ${matched ? "is-uploaded" : ""}`} key={slotKey}>
                      <span className="ws-document-number">{String(index + 1).padStart(2, "0")}</span>
                      <div className="ws-document-copy">
                        <div>
                          <h3>{req.title}</h3>
                          <em className={required ? "is-required" : ""}>{required ? t("ws.required") : t("ws.optional")}</em>
                        </div>
                        <p>{req.description || t("ws.slotHint")}</p>
                        {matched && <small><CheckCircle2 size={13} /> {matched.originalFilename}</small>}
                      </div>
                      {matched ? (
                        <button className="ws-replace" type="button" disabled={busy} onClick={() => openFilePicker(slotKey, req.title)}>
                          {busy ? t("ws.working") : t("ws.replace")}
                        </button>
                      ) : (
                        <button className="ws-upload" type="button" disabled={busy} onClick={() => openFilePicker(slotKey, req.title)}>
                          {busy ? t("ws.working") : <><Upload size={15} /> {t("ws.uploadPdf")}</>}
                        </button>
                      )}
                      {matched && (
                        <button className="ws-view" type="button" onClick={() => downloadDoc(matched)} title={t("ws.downloadTitle")}>
                          <Download size={15} />
                        </button>
                      )}
                    </article>
                  );
                }) : <div className="ws-empty"><FileText size={20} /> {t("ws.noRequirements")}</div>}
              </div>
            </section>

            <section className="ws-technical-card">
              <div className="ws-section-head">
                <div>
                  <span className="ws-eyebrow">{t("ws.stepTwo")}</span>
                  <h2>{t("ws.technicalTitle")}</h2>
                  <p>{t("ws.technicalDesc")}</p>
                </div>
                <span className={technicalDocument ? "ws-complete-pill" : ""}>{technicalDocument ? t("ws.uploaded") : t("ws.required")}</span>
              </div>
              <div className={`ws-technical-dropzone ${technicalDocument ? "is-uploaded" : ""}`}>
                <div className="ws-tech-icon">{technicalDocument ? <CheckCircle2 size={22} /> : <FileText size={22} />}</div>
                <div>
                  <strong>{technicalDocument ? technicalDocument.originalFilename : t("ws.technicalName")}</strong>
                  <p>{technicalDocument ? t("ws.technicalAttached") : t("ws.technicalHint")}</p>
                </div>
                <button type="button" className={technicalDocument ? "ws-replace" : "ws-upload"} disabled={uploadingSlot === "TECHNICAL_BID"} onClick={() => openFilePicker("TECHNICAL_BID", "Technical Proposal")}>
                  {uploadingSlot === "TECHNICAL_BID" ? t("ws.working") : technicalDocument ? t("ws.replace") : <><Upload size={15} /> {t("ws.uploadTechnical")}</>}
                </button>
              </div>
            </section>
          </div>

          <aside className="ws-aside">
            <section className="ws-tender-card">
              <span className="ws-eyebrow">{t("ws.asideKicker")}</span>
              <h2>{t("ws.asideTitle")}</h2>
              <dl>
                <div><dt>{t("ws.asideDept")}</dt><dd><Building2 size={14} /> {tender?.department || "—"}</dd></div>
                <div><dt>{t("ws.deadline")}</dt><dd><Clock3 size={14} /> {dateTimeLabel(deadline)}</dd></div>
                <div><dt>{t("ws.asideDocs")}</dt><dd><FileText size={14} /> {documents.length} / {requirements.length || "—"}</dd></div>
              </dl>
            </section>
            <section className="ws-help-card">
              <LockKeyhole size={18} />
              <div><strong>{t("ws.helpTitle")}</strong><p>{t("ws.helpDesc")}</p></div>
            </section>
            <button type="button" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => navigate("/vendor/dashboard")}>
              {t("ws.doneBack")} <ArrowRight size={15} />
            </button>
            {readyToSubmit && (
              <div className="alert alert-info" style={{ marginTop: 12, fontSize: 12 }}>
                <Check size={14} /> {t("ws.allReady")}
              </div>
            )}
          </aside>
        </section>

        {uploadSuccess && <div className="alert alert-info" style={{ marginTop: 14 }}><CheckCircle2 size={15} /> {uploadSuccess}</div>}
        {uploadError && <div className="alert alert-error" style={{ marginTop: 14 }}>{uploadError}</div>}
        <input ref={uploadInput} style={{ display: "none" }} type="file" accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp" onChange={uploadFile} />
      </main>
    </AppShell>
  );
}
