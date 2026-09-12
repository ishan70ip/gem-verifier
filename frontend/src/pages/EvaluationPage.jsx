import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AppShell from "@/components/AppShell";
import EvaluationHeader from "@/components/evaluation/EvaluationHeader";
import ComplianceSummary from "@/components/evaluation/ComplianceSummary";
import ComplianceMatrix from "@/components/evaluation/ComplianceMatrix";
import EvidenceDrawer from "@/components/evaluation/EvidenceDrawer";
import { completeEvaluation, getEvaluationById, resolveComplianceResult, runAiAnalysis, downloadReportCsv } from "@/services/evaluationService";
import { Sparkles, Download } from "lucide-react";

export default function EvaluationPage() {
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

  const load = () => {
    setLoaded(false);
    getEvaluationById(id).then(setData).catch(() => setData(null)).finally(() => setLoaded(true));
  };
  useEffect(load, [id]);

  const results = useMemo(
    () => (data?.results || []).map(result => ({ ...result, status: resolvedResults[`${result.vendorId}-${result.requirementId}`] || result.status })),
    [data, resolvedResults]
  );

  if (!loaded) return <AppShell><div className="page-content"><div className="card"><div className="empty-state"><h3>Loading evaluation</h3><p>Retrieving compliance results from the procurement database.</p></div></div></div></AppShell>;
  if (!data) return <AppShell><div className="page-content"><div className="card"><div className="empty-state"><h3>Evaluation not available</h3><p>This evaluation could not be found.</p><Link to="/tenders" className="btn btn-primary">Back to evaluations</Link></div></div></div></AppShell>;

  const selectedRequirement = selectedResult && (data.requirements || []).find(requirement => requirement.id === selectedResult.requirementId);
  const selectedVendorData = selectedResult && (data.vendors || []).find(vendor => vendor.id === selectedResult.vendorId);

  const handleResolve = status => {
    if (!selectedResult || data.evaluation.status === "CONTRACT_AWARDED" || data.evaluation.status === "AWARDED") return;
    resolveComplianceResult(selectedResult.id, status).catch(() => null);
    setResolvedResults(current => ({ ...current, [`${selectedResult.vendorId}-${selectedResult.requirementId}`]: status }));
    setSelectedResult(current => ({ ...current, status }));
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
      setError(err.message || "AI analysis failed");
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
          <span>✓ Documents processed</span><i /><span>✓ Requirements extracted</span><i /><span>✓ Vendor bids analyzed</span><i />
          <span>{data.evaluation.status === "CONTRACT_AWARDED" || data.evaluation.status === "AWARDED" ? "✓ Contract awarded" : data.evaluation.status === "EVALUATION_COMPLETED" || data.evaluation.status === "COMPLETED" ? "✓ Evaluation complete" : "○ Evaluation pending"}</span>
        </div>

        {results.length === 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-body" style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ fontSize: 13.5 }}>
                <b>No verification results yet.</b>
                <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>Run the AI verification pipeline to parse bid PDFs, cross-check portal records and score every vendor.</div>
              </div>
              <button className="btn btn-primary" onClick={handleRunAnalysis} disabled={busy === "analyze"}>
                <Sparkles size={15} /> {busy === "analyze" ? "Analysing bids…" : "Run AI verification"}
              </button>
            </div>
          </div>
        )}

        {data.summary?.vendors && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-header-title">AI recommendation {aiMode ? <span className="chip" style={{ marginLeft: 6 }}>mode: {aiMode}</span> : null}</div>
              <button className="btn btn-ghost" onClick={handleDownload} disabled={busy === "csv"}>
                <Download size={14} /> {busy === "csv" ? "Preparing…" : "Export CSV report"}
              </button>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(data.vendors || []).map(vendor => (
                <div key={vendor.id} style={{ padding: "10px 12px", background: "#F8FAFC", border: "1px solid var(--border-light)", borderRadius: 6, fontSize: 13 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <b>{vendor.name}</b>
                    <span className="chip">{vendor.compliancePercentage}% score</span>
                    {vendor.riskLevel && <span className="chip">Risk: {vendor.riskLevel}</span>}
                    <span className="chip">{vendor.eligibility?.replace("_", " ")}</span>
                  </div>
                  <div style={{ color: "var(--text-secondary)", marginTop: 5, lineHeight: 1.55 }}>{vendor.recommendation}</div>
                </div>
              ))}
              {results.length > 0 && (
                <button className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={handleRunAnalysis} disabled={busy === "analyze"}>
                  <Sparkles size={14} /> {busy === "analyze" ? "Re-analysing…" : "Re-run AI verification"}
                </button>
              )}
            </div>
          </div>
        )}

        <ComplianceSummary vendors={data.vendors || []} requirements={data.requirements || []} results={results} lastProcessed={data.evaluation.lastProcessed} onOpenVendor={vendor => setSelectedVendor(vendor.id)} />

        <section className="review-queue-new">
          <div>
            <span className="review-queue-icon">⚠</span>
            <span>
              <b>{needsReview} requirements need your attention</b>
              <small>{data.evaluation.status === "CONTRACT_AWARDED" || data.evaluation.status === "AWARDED" ? "This evaluation is read-only after contract assignment." : needsReview ? "Resolve every uncertain result before completing the evaluation." : "All requirement decisions are ready for completion."}</small>
            </span>
          </div>
          <button onClick={() => setFilter("NEEDS_REVIEW")}>Open review queue →</button>
        </section>

        <ComplianceMatrix requirements={data.requirements || []} vendors={data.vendors || []} results={results} filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} selectedVendor={selectedVendor} setSelectedVendor={setSelectedVendor} mandatoryOnly={mandatoryOnly} setMandatoryOnly={setMandatoryOnly} onSelect={setSelectedResult} />
      </main>
      {selectedResult && <EvidenceDrawer result={selectedResult} requirement={selectedRequirement} vendor={selectedVendorData} onClose={() => setSelectedResult(null)} onResolve={handleResolve} />}
    </AppShell>
  );
}
