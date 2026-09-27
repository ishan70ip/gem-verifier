import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import VendorDocumentsDrawer from "@/components/evaluation/VendorDocumentsDrawer";
import DocumentPreviewModal from "@/components/evaluation/DocumentPreviewModal";
import { getTender } from "@/services/procurementService";
import { createEvaluation, runAiAnalysis } from "@/services/evaluationService";
import { apiRequest } from "@/services/apiClient";
import { ArrowRight, FileText, FolderOpen, Sparkles, Users, Calendar, ShieldCheck } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";


export default function TenderDetailPage() {
  const { t } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const [tender, setTender] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [documentsBid, setDocumentsBid] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [catFilter, setCatFilter] = useState("ALL");

  const load = () => {
    setLoaded(false);
    getTender(id).then(setTender).catch(() => setTender(null)).finally(() => setLoaded(true));
  };
  useEffect(load, [id]);

  const handleRunVerification = async () => {
    setBusy("analyze");
    setError("");
    setNotice("");
    try {
      const created = await createEvaluation(id);
      const evaluationId = created?.evaluation?.id || created?.evaluation?._id || created?.id;
      const analysed = await runAiAnalysis(evaluationId);
      const finalId = analysed?.evaluation?.id || evaluationId;
      navigate(`/evaluations/${finalId}`);
    } catch (err) {
      setError(err.message || t("tenderDetail.verificationFailed"));
    } finally {
      setBusy("");
    }
  };

  const bids = tender?.bids || [];
  const requirements = tender?.requirements || [];
  const documents = tender?.documents || [];

  const categories = useMemo(() => {
    const seen = [];
    for (const req of requirements) {
      if (req.category && !seen.includes(req.category)) seen.push(req.category);
    }
    return seen;
  }, [requirements]);

  const visibleReqs = useMemo(() => {
    if (catFilter === "ALL") return requirements;
    if (catFilter === "MANDATORY") return requirements.filter((req) => req.mandatory);
    return requirements.filter((req) => req.category === catFilter);
  }, [requirements, catFilter]);

  if (!loaded) return <AppShell><div className="page-content"><div className="card"><div className="empty-state"><h3>{t("tenderDetail.loadingTitle")}</h3><p>{t("tenderDetail.loadingSubtitle")}</p></div></div></div></AppShell>;
  if (!tender) return <AppShell><div className="page-content"><div className="card"><div className="empty-state"><h3>{t("tenderDetail.notAvailableTitle")}</h3><p>{t("tenderDetail.notFoundText")}</p><Link to="/tenders" className="btn btn-primary">{t("tenderDetail.backToEvaluations")}</Link></div></div></div></AppShell>;

  return (
    <AppShell>
      <main className="tdet-page">
        <Link to="/tenders" className="ws-back">← {t("tenderDetail.backToEvaluations")}</Link>

        <section className="tdet-head-card">
          <div>
            <span className="ws-eyebrow">{t("tenderDetail.kicker")}</span>
            <h1>{tender.name}</h1>
            <div className="tdet-ref-row">
              <span className="mono">{tender.tenderRef}</span>
              <span className="chip">{tender.status || t("tenderDetail.active")}</span>
            </div>
          </div>
          <div className="tdet-count-badge">
            <b>{bids.length}</b>
            <span>{t("tenderDetail.bidsCountLabel")}</span>
          </div>
        </section>

        <section className="tdet-brief-card">
          <span className="ws-eyebrow">{t("tenderDetail.briefKicker")}</span>
          <h2>{t("tenderDetail.briefTitle")}</h2>
          <div className="tdet-brief-grid">
            <p>{tender.description || t("tenderDetail.noDescription")}</p>
            <div className="tdet-meta-boxes">
              <div><span>{t("tenderDetail.reference")}</span><b className="mono">{tender.tenderRef}</b></div>
              <div><span>{t("tenderDetail.department")}</span><b>{tender.department || "—"}</b></div>
              <div><span>{t("tenderDetail.deadline")}</span><b>{tender.deadline ? new Date(tender.deadline).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—"}</b></div>
            </div>
          </div>
        </section>

        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-info">{notice}</div>}

        <section className="tdet-verify-card">
          <div className="tdet-verify-copy">
            <span className="ws-eyebrow">{t("tenderDetail.verifyKicker")}</span>
            <h2><ShieldCheck size={16} /> {t("tenderDetail.verifyTitle")}</h2>
            <p>{t("tenderDetail.verifyDesc")}</p>
          </div>
          <div className="tdet-verify-actions">
            <button className="btn btn-primary" disabled={busy === "analyze" || bids.length === 0} onClick={handleRunVerification} title={bids.length === 0 ? t("tenderDetail.waitingForBids") : t("tenderDetail.runVerificationHint")}>
              <Sparkles size={15} /> {busy === "analyze" ? t("tenderDetail.analysingBids") : t("tenderDetail.runVerification")}
            </button>
            {bids.length === 0 && <div className="field-hint">{t("tenderDetail.enabledOnceHint")}</div>}
          </div>
        </section>

        <div className="tdet-layout">
          <section className="tdet-req-card">
            <span className="ws-eyebrow">{t("tenderDetail.scopeKicker")}</span>
            <h2>{t("tenderDetail.requirementsTitle")} <span className="chip">{requirements.length}</span></h2>
            <p className="tdet-sub">{t("tenderDetail.scopeDesc")}</p>
            <div className="tdet-pills">
              {["ALL", "MANDATORY", ...categories].map((cat) => (
                <button
                  key={cat}
                  className={catFilter === cat ? "active" : ""}
                  onClick={() => setCatFilter(cat)}
                >
                  {cat === "ALL" ? t("tenderDetail.pillAll") : cat === "MANDATORY" ? t("tenderDetail.mandatory") : cat}
                </button>
              ))}
            </div>
            <div className="tdet-req-grid">
              {visibleReqs.length === 0 && <p className="ws-empty">{t("tenderDetail.noRequirements")}</p>}
              {visibleReqs.map((req, index) => (
                <article className="tdet-req" key={req.id}>
                  <span className="tdet-req-num">{String(requirements.indexOf(req) + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="tdet-req-tags"><span className="chip">{req.category}</span>{req.mandatory && <span className="chip">{t("tenderDetail.mandatory")}</span>}</div>
                    <b>{req.title}</b>
                    <p>{req.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="tdet-aside">
            <section className="tdet-bids-card">
              <div className="tdet-bids-head">
                <div>
                  <span className="ws-eyebrow">{t("tenderDetail.bidsKicker")}</span>
                  <h2>{t("tenderDetail.bidsTitle")} <span className="chip">{bids.length}</span></h2>
                </div>
                <Link to="/vendors" className="btn-view-details">{t("tenderDetail.viewVendors")}</Link>
              </div>
              {bids.length === 0 ? (
                <div className="ws-empty"><Users size={18} /><p>{t("tenderDetail.noBids")}</p></div>
              ) : (
                bids.map((bid) => {
                  const bidDocs = documents.filter((d) => d.bidId === bid.id);
                  return (
                    <div className="tdet-bid-row" key={bid.id}>
                      <div>
                        <b>{bid.companyName || bid.vendorName || t("tenderDetail.vendorFallback")}</b>
                        <small className="mono">{bid.bidReference}</small>
                        <small>{bid.submittedAt ? new Date(bid.submittedAt).toLocaleDateString() : ""} · {bidDocs.length} {t("tenderDetail.documentsCol")}</small>
                      </div>
                      <button
                        className="btn btn-ghost"
                        disabled={bidDocs.length === 0}
                        onClick={() => {
                          if (bidDocs.length === 1) setPreviewDoc(bidDocs[0]);
                          else setDocumentsBid({ name: bid.companyName || bid.vendorName || t("tenderDetail.vendorFallback"), bid: { id: bid.id, bidReference: bid.bidReference } });
                        }}
                      >
                        <FolderOpen size={13} /> {t("tenderDetail.view")} ({bidDocs.length})
                      </button>
                    </div>
                  );
                })
              )}
            </section>

            <section className="tdet-flow-card">
              <span className="ws-eyebrow">{t("tenderDetail.flowKicker")}</span>
              <h2>{t("tenderDetail.flowTitle")}</h2>
              <ol>
                <li><b>01</b> {t("tenderDetail.flowStep1")}</li>
                <li><b>02</b> {t("tenderDetail.flowStep2")}</li>
                <li><b>03</b> {t("tenderDetail.flowStep3")}</li>
              </ol>
            </section>
          </aside>
        </div>
      </main>
      {documentsBid && (
        <VendorDocumentsDrawer
          vendor={documentsBid}
          documents={documents.filter((d) => d.bidId === documentsBid.bid?.id)}
          onClose={() => setDocumentsBid(null)}
          onView={setPreviewDoc}
        />
      )}
      <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </AppShell>
  );
}
