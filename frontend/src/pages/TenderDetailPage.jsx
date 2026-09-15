import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import VendorDocumentsDrawer from "@/components/evaluation/VendorDocumentsDrawer";
import DocumentPreviewModal from "@/components/evaluation/DocumentPreviewModal";
import { getTender } from "@/services/procurementService";
import { createEvaluation, runAiAnalysis } from "@/services/evaluationService";
import { ArrowRight, FileText, FolderOpen, Sparkles, Upload } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export default function TenderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tender, setTender] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [documentsBid, setDocumentsBid] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

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
      setError(err.message || "AI verification failed");
    } finally {
      setBusy("");
    }
  };

  if (!loaded) return <AppShell><div className="page-content"><div className="card"><div className="empty-state"><h3>Loading tender</h3><p>Retrieving the tender record from the procurement database.</p></div></div></div></AppShell>;
  if (!tender) return <AppShell><div className="page-content"><div className="card"><div className="empty-state"><h3>Tender not available</h3><p>This tender could not be found.</p><Link to="/tenders" className="btn btn-primary">Back to evaluations</Link></div></div></div></AppShell>;

  const bids = tender.bids || [];
  const requirements = tender.requirements || [];
  const documents = tender.documents || [];

  return (
    <AppShell>
      <div className="page-bar">
        <div>
          <div className="page-title">{tender.name}</div>
          <div className="breadcrumb" style={{ marginTop: 2 }}>
            <Link to="/">Home</Link><span className="breadcrumb-sep">/</span>
            <Link to="/tenders">Tenders</Link><span className="breadcrumb-sep">/</span>
            <span>{tender.tenderRef}</span>
          </div>
        </div>
        <button className="btn btn-primary" disabled={busy === "analyze" || bids.length === 0} onClick={handleRunVerification} title={bids.length === 0 ? "Waiting for vendor bids" : "Extract, cross-verify and score every bid"}>
          <Sparkles size={15} /> {busy === "analyze" ? "Analysing bids…" : "Run AI verification"}
        </button>
      </div>

      <div className="page-content">
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
        {notice && <div className="alert alert-info" style={{ marginBottom: 16 }}>{notice}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card">
              <div className="card-header">
                <div className="card-header-title">Tender Details</div>
                <span className="chip">{tender.status || "Active"}</span>
              </div>
              <div className="card-body">
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>{tender.description || "No description provided."}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px" }}>
                  {[["Reference", tender.tenderRef], ["Department", tender.department], ["Deadline", tender.deadline ? new Date(tender.deadline).toLocaleDateString() : "—"]].map(([label, val]) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                      <div style={{ marginTop: 3, fontSize: 13.5, fontWeight: 600 }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-header-title">Compliance Requirements <span className="chip" style={{ marginLeft: 4 }}>{requirements.length}</span></div>
              </div>
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {requirements.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No requirements defined.</p>}
                {requirements.map((req) => (
                  <div key={req.id} style={{ padding: "10px 12px", background: "#F8FAFC", border: "1px solid var(--border-light)", borderRadius: 6 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700 }}>
                      {req.title}
                      <span className="chip">{req.category}</span>
                      {req.mandatory && <span className="chip">Mandatory</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>{req.description}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-header-title">Submitted Bids <span className="chip" style={{ marginLeft: 4 }}>{bids.length}</span></div>
              </div>
              {bids.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  No bids submitted yet. Vendors submit through the Vendor portal; they will appear here automatically.
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr><th>Vendor</th><th>Bid Ref</th><th>Submitted</th><th></th><th>Documents</th></tr>
                  </thead>
                  <tbody>
                    {bids.map((bid) => {
                      const bidDocs = documents.filter((d) => d.bidId === bid.id);
                      return (
                        <tr key={bid.id}>
                          <td style={{ fontWeight: 600, fontSize: 13 }}>{bid.companyName || bid.vendorName || "Vendor"}</td>
                          <td><span className="mono" style={{ fontSize: 12 }}>{bid.bidReference}</span></td>
                          <td style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{bid.submittedAt ? new Date(bid.submittedAt).toLocaleString() : "—"}</td>
                          <td><span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{bid.submissionStatus}</span></td>
                          <td>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: "6px 10px", fontSize: 11.5 }}
                              disabled={bidDocs.length === 0}
                              onClick={() => {
                                // Skip the intermediate documents list when there's
                                // only one file — go straight to the preview.
                                if (bidDocs.length === 1) setPreviewDoc(bidDocs[0]);
                                else setDocumentsBid({ name: bid.companyName || bid.vendorName || "Vendor", bid: { id: bid.id, bidReference: bid.bidReference } });
                              }}
                            >
                              <FolderOpen size={13} /> View ({bidDocs.length})
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 80 }}>
            <div className="card">
              <div className="card-header"><div className="card-header-title">AI verification</div></div>
              <div className="card-body">
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.6 }}>
                  Parses every bid PDF, extracts statutory fields, cross-checks portal records and produces pass / warning / fail with a compliance score.
                </p>
                <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy === "analyze" || bids.length === 0} onClick={handleRunVerification}>
                  {busy === "analyze" ? "Analysing…" : "Run AI verification"} <ArrowRight size={13} />
                </button>
                {bids.length === 0 && <div className="field-hint" style={{ marginTop: 8 }}>Enabled once at least one bid is submitted.</div>}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-header-title">Vendor submissions</div></div>
              <div className="card-body">
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  Vendor bids submitted through their portal appear here after storage in the procurement database.
                </p>
                <div style={{ marginTop: 10 }}>
                  <Link to="/vendors" className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }}>View vendors <ArrowRight size={13} /></Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
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