import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AppShell from "@/components/AppShell";
import EvaluationHeader from "@/components/evaluation/EvaluationHeader";
import ComplianceSummary from "@/components/evaluation/ComplianceSummary";
import ComplianceMatrix from "@/components/evaluation/ComplianceMatrix";
import EvidenceDrawer from "@/components/evaluation/EvidenceDrawer";
import VendorDocumentsDrawer from "@/components/evaluation/VendorDocumentsDrawer";
import DocumentPreviewModal from "@/components/evaluation/DocumentPreviewModal";
import { completeEvaluation, getEvaluationById, resolveComplianceResult, runAiAnalysis, downloadReportCsv } from "@/services/evaluationService";
import { Sparkles, Download } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export default function EvaluationPage() {
  const { t } = useLanguage();
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("ALL");
  const [mandatoryOnly, setMandatoryOnly] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const [resolvedResults, setResolvedResults] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [documentsVendor, setDocumentsVendor] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  const load = () => {
    setLoaded(false);
    getEvaluationById(id).then(setData).catch(() => setData(null)).finally(() => setLoaded(true));
  };
  useEffect(load, [id]);

  const results = useMemo(
    () => (data?.results || []).map(result => ({ ...result, status: resolvedResults[`${result.vendorId}-${result.requirementId}`] || result.status })),
    [data, resolvedResults]
  );

  if (!loaded) return <AppShell><div className="page-content"><div className="card"><div className="empty-state"><h3>{t("eval.loadingTitle")}</h3><p>{t("eval.loadingDesc")}</p></div></div></div></AppShell>;
  if (!data) return <AppShell><div className="page-content"><div className="card"><div className="empty-state"><h3>{t("eval.unavailableTitle")}</h3><p>{t("eval.unavailableDesc")}</p><Link to="/tenders" className="btn btn-primary">{t("eval.backToEvaluations")}</Link></div></div></div></AppShell>;

  const selectedRequirement = selectedResult && (data.requirements || []).find(requirement => requirement.id === selectedResult.requirementId);
  const selectedVendorData = selectedResult && (data.vendors || []).find(vendor => vendor.id === selectedResult.vendorId);

  const handleResolve = async (status, reviewComment) => {
    if (!selectedResult) return;
    if (data.evaluation.status === "CONTRACT_AWARDED" || data.evaluation.status === "AWARDED") {
      setError(t("eval.readOnlyNote"));
      return;
    }
    try {
      await resolveComplianceResult(selectedResult.id, status, reviewComment);
      setResolvedResults(current => ({ ...current, [`${selectedResult.vendorId}-${selectedResult.requirementId}`]: status }));
      setSelectedResult(current => ({ ...current, status }));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleComplete = () => {
    completeEvaluation(id)
      .then(updated => setData(current => ({ ...current, evaluation: updated?.evaluation || updated || { ...current.evaluation, status: "EVALUATION_COMPLETED" } })))
      .catch((err) => setError(err.message));
  };

  const handleRunAnalysis = async () => {
    setBusy("analyze");
    setError("");
    try {
      const updated = await runAiAnalysis(id);
      setData(updated);
      setResolvedResults({});
    } catch (err) {
      setError(err.message || t("eval.aiAnalysisFailed"));
    } finally {
      setBusy("");
    }
  };

  const handleDownload = async () => {
    setBusy("csv");
    try {
      await downloadReportCsv(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const needsReview = results.filter(result => result.status === "FLAG_FOR_REVIEW" || result.status === "NOT_FOUND").length;
  const aiMode = data.summary?.mode || data.evaluation.aiMode;

  return (
    <AppShell>
      <main className="evaluation-workspace">
        <EvaluationHeader evaluation={data.evaluation} onComplete={needsReview === 0 ? handleComplete : null} />

        {error && <div className="alert alert-error" style={{ margin: "0 0 12px" }}>{error}</div>}

        <div className="pipeline-strip-new">
          <span>{t("eval.stepDocs")}</span><i /><span>{t("eval.stepRequirements")}</span><i /><span>{t("eval.stepBids")}</span><i />
          <span>{data.evaluation.status === "CONTRACT_AWARDED" || data.evaluation.status === "AWARDED" ? t("eval.stepAwarded") : data.evaluation.status === "EVALUATION_COMPLETED" || data.evaluation.status === "COMPLETED" ? t("eval.stepComplete") : t("eval.stepPending")}</span>
        </div>

        {results.length === 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-body" style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ fontSize: 13.5 }}>
                <b>{t("eval.noResultsTitle")}</b>
                <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>{t("eval.noResultsDesc")}</div>
              </div>
              <button className="btn btn-primary" onClick={handleRunAnalysis} disabled={busy === "analyze"}>
                <Sparkles size={15} /> {busy === "analyze" ? t("eval.analysing") : t("eval.runVerification")}
              </button>
            </div>
          </div>
        )}

        {data.summary?.vendors && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-header-title">{t("eval.aiRecommendation")} {aiMode ? <span className="chip" style={{ marginLeft: 6 }}>{t("eval.modeLabel")} {aiMode}</span> : null}</div>
              <button className="btn btn-ghost" onClick={handleDownload} disabled={busy === "csv"}>
                <Download size={14} /> {busy === "csv" ? t("eval.preparing") : t("eval.exportCsv")}
              </button>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(data.vendors || []).map(vendor => (
                <div key={vendor.id} style={{ padding: "10px 12px", background: "#F8FAFC", border: "1px solid var(--border-light)", borderRadius: 6, fontSize: 13 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <b>{vendor.name}</b>
                    <span className="chip">{vendor.compliancePercentage}% {t("eval.scoreUnit")}</span>
                    {vendor.riskLevel && <span className="chip">{t("eval.riskLabel")} {vendor.riskLevel}</span>}
                    <span className="chip">{vendor.eligibility?.replace("_", " ")}</span>
                  </div>
                  <div style={{ color: "var(--text-secondary)", marginTop: 5, lineHeight: 1.55 }}>{vendor.recommendation}</div>
                </div>
              ))}
              {results.length > 0 && (
                <button className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={handleRunAnalysis} disabled={busy === "analyze"}>
                  <Sparkles size={14} /> {busy === "analyze" ? t("eval.reanalysing") : t("eval.rerunVerification")}
                </button>
              )}
            </div>
          </div>
        )}

        <ComplianceSummary vendors={data.vendors || []} requirements={data.requirements || []} results={results} documents={data.documents || []} lastProcessed={data.evaluation.lastProcessed} onOpenVendor={vendor => setSelectedVendor(vendor.id)} onViewVendorDocuments={(vendor, docs) => {
          // Skip the intermediate documents list when there's only one file
          // — go straight to the preview.
          if (docs.length === 1) setPreviewDoc(docs[0]);
          else setDocumentsVendor(vendor);
        }} />

        <section className="review-queue-new">
          <div>
            <span className="review-queue-icon">⚠</span>
            <span>
              <b>{needsReview} {t("eval.needsAttention")}</b>
              <small>{data.evaluation.status === "CONTRACT_AWARDED" || data.evaluation.status === "AWARDED" ? t("eval.readOnlyNote") : needsReview ? t("eval.resolveNote") : t("eval.readyNote")}</small>
            </span>
          </div>
          <button onClick={() => setFilter("NEEDS_REVIEW")}>{t("eval.openReviewQueue")}</button>
        </section>

        <ComplianceMatrix requirements={data.requirements || []} vendors={data.vendors || []} results={results} filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} selectedVendor={selectedVendor} setSelectedVendor={setSelectedVendor} mandatoryOnly={mandatoryOnly} setMandatoryOnly={setMandatoryOnly} onSelect={setSelectedResult} />
      </main>
      {selectedResult && (
        <EvidenceDrawer
          result={selectedResult}
          requirement={selectedRequirement}
          vendor={selectedVendorData}
          documents={data.documents || []}
          readOnly={data.evaluation.status === "CONTRACT_AWARDED" || data.evaluation.status === "AWARDED"}
          onClose={() => setSelectedResult(null)}
          onResolve={handleResolve}
          onViewSourceDocument={setPreviewDoc}
        />
      )}
      {documentsVendor && (
        <VendorDocumentsDrawer
          vendor={documentsVendor}
          documents={(data.documents || []).filter(doc => doc.bidId === documentsVendor.bid?.id)}
          onClose={() => setDocumentsVendor(null)}
          onView={setPreviewDoc}
        />
      )}
      <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </AppShell>
  );
}