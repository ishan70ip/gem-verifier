import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { getEvaluationById } from "@/services/evaluationService";
import { assignContract } from "@/services/procurementService";
import { CheckCircle2, ArrowLeft, ShieldCheck, Award } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

// Officer approval: tick one or more vendors to approve. Each approval
// creates its own award record (visible in balance: backend allows repeat
// POST /awards calls once the evaluation is complete).
export default function ContractAwardPage() {
  const { t } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [approved, setApproved] = useState([]);

  useEffect(() => {
    getEvaluationById(id).then(setData).catch(() => setData(null));
  }, [id]);

  if (!data) {
    return <AppShell><div className="page-content"><div className="card"><div className="empty-state"><h3>{t("award.unavailableTitle")}</h3><p>{t("award.unavailableDesc")}</p><Link to="/tenders" className="btn btn-primary">{t("award.backToEvaluations")}</Link></div></div></div></AppShell>;
  }

  const vendors = data.vendors || [];
  const toggle = (vendorId) =>
    setSelected((prev) => (prev.includes(vendorId) ? prev.filter((v) => v !== vendorId) : [...prev, vendorId]));
  const selectedVendors = vendors.filter((v) => selected.includes(v.id));

  const submit = (event) => {
    event.preventDefault();
    if (selectedVendors.length) setConfirming(true);
  };

  const confirmAssignment = async () => {
    setSaving(true);
    setError("");
    try {
      const tenderId = data.evaluation.tenderId || data.evaluation.tender_id;
      const done = [];
      for (const vendor of selectedVendors) {
        const award = await assignContract(id, vendor.id, tenderId);
        done.push({ vendor, award });
      }
      setApproved(done);
      setConfirming(false);
    } catch {
      setError(t("award.saveError"));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <main className="page-content" style={{ maxWidth: 850 }}>
        <Link to={`/evaluations/${id}`} className="evaluation-back"><ArrowLeft size={15} /> {t("award.backToEvaluation")}</Link>
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <div>
              <div className="section-kicker">{t("award.kicker")}</div>
              <div className="card-header-title">{t("award.titleMulti")}</div>
              <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", fontSize: 12 }}>{t("award.subtitleMulti")}</p>
            </div>
            <span className="status-pill done"><CheckCircle2 size={13} /> {t("award.evaluationCompleted")}</span>
          </div>
          <div className="card-body">
            <div className="alert alert-info" style={{ marginBottom: 18 }}><ShieldCheck size={15} /> {t("award.infoNoteMulti")}</div>
            <div style={{ marginBottom: 18 }}>
              <strong>{data.evaluation.title}</strong>
              <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 4 }}>{data.evaluation.tenderReference} · {data.evaluation.department}</div>
            </div>
            {approved.length > 0 && (
              <div className="alert alert-info" style={{ marginBottom: 18 }}>
                <Award size={15} />
                <div>
                  <b>{t("award.approvedDone")}</b>
                  {approved.map(({ vendor, award }) => (
                    <div key={vendor.id} style={{ marginTop: 6, fontSize: 13 }}>
                      {vendor.name} · <span className="mono">{award.contractReference}</span>
                      {" · "}<Link to={`/contracts/${award.id}`}>{t("award.viewContract")}</Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {vendors.length ? (
              <form onSubmit={submit}>
                <label className="field-label">{t("award.selectVendors")}</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {vendors.map((vendor) => (
                    <label key={vendor.id} className="req-item-box" style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={selected.includes(vendor.id)}
                        onChange={() => toggle(vendor.id)}
                      />
                      <span style={{ flex: 1 }}>
                        <b style={{ fontSize: 13.5 }}>{vendor.name}</b>
                        <small style={{ display: "block", color: "var(--text-secondary)" }}>
                          {vendor.compliancePercentage ?? "—"}% · {vendor.eligibility?.replace("_", " ")}
                        </small>
                      </span>
                      <span className="chip">{vendor.riskLevel || ""}</span>
                    </label>
                  ))}
                </div>
                {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <Link to={`/evaluations/${id}`} className="btn btn-ghost">{t("award.cancel")}</Link>
                  <button className="btn btn-primary" disabled={saving || selected.length === 0}>
                    <Award size={14} /> {t("award.approveSelected")} ({selected.length})
                  </button>
                </div>
              </form>
            ) : (
              <div className="empty-state"><h3>{t("award.noEligibleTitle")}</h3><p>{t("award.noEligibleDesc")}</p></div>
            )}
          </div>
        </section>
      </main>
      {confirming && (
        <div className="drawer-overlay-new" role="dialog" aria-modal="true">
          <div className="card" style={{ width: "min(480px, calc(100vw - 32px))", margin: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <div className="card-header"><div className="card-header-title">{t("award.confirmTitleMulti")}</div></div>
            <div className="card-body">
              <p style={{ lineHeight: 1.6, color: "var(--text-secondary)" }}>{t("award.confirmLeadMulti")}</p>
              <ul style={{ lineHeight: 1.8 }}>
                {selectedVendors.map((v) => <li key={v.id}><strong>{v.name}</strong></li>)}
              </ul>
              <p style={{ lineHeight: 1.6, color: "var(--text-secondary)" }}>{t("award.confirmNote")}</p>
              {error && <div className="alert alert-error">{error}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
                <button className="btn btn-ghost" onClick={() => setConfirming(false)}>{t("award.cancel")}</button>
                <button className="btn btn-primary" onClick={confirmAssignment} disabled={saving}>{saving ? t("award.assigning") : t("award.confirmAssignmentMulti")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
