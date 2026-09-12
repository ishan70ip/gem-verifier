import AppShell from "@/components/AppShell";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { createTender } from "@/services/procurementService";
import { ArrowLeft, Info } from "lucide-react";

export default function NewTenderPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", tenderRef: "", department: "", deadline: "",
    emdRequired: "", minExperienceYears: "", minAnnualTurnover: "",
  });

  const [error, setError] = useState("");
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try { const tender = await createTender({ reference_number: form.tenderRef, title: form.name, department: form.department, submission_deadline: form.deadline, description: "", requirements: [{ title: "Earnest Money Deposit", description: `Minimum EMD required: ₹${form.emdRequired}`, category: "Financial", mandatory: true, requirement_order: 1 }, { title: "Years of Experience", description: `Minimum ${form.minExperienceYears} years of relevant experience`, category: "Eligibility", mandatory: true, requirement_order: 2 }, { title: "Annual Turnover", description: `Minimum annual turnover: ₹${form.minAnnualTurnover}`, category: "Financial", mandatory: true, requirement_order: 3 }] }); navigate(`/tenders/${tender.id}`); }
    catch { setError("The procurement service is unavailable. Connect the backend before creating a tender."); }
  };

  return (
    <AppShell>
      <div className="page-bar">
        <div>
          <div className="page-title">Create New Tender</div>
          <div className="breadcrumb" style={{ marginTop: 2 }}>
            <Link to="/">Home</Link><span className="breadcrumb-sep">/</span>
            <Link to="/tenders">Tenders</Link><span className="breadcrumb-sep">/</span>
            <span>New Tender</span>
          </div>
        </div>
      </div>

      <div className="page-content" style={{ maxWidth: 680 }}>
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            Define the AI verification rules for this tender. The system will automatically extract and validate these three parameters from every submitted bid.
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 20 }}><Info size={14} />{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-header-title">Tender Identity</div>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="field-label">Tender Name <span style={{ color: "var(--status-red)" }}>*</span></label>
                <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Supply of IT Infrastructure for District Offices" required />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label className="field-label">Tender Reference No. <span style={{ color: "var(--status-red)" }}>*</span></label>
                  <input className="input-field" value={form.tenderRef} onChange={e => setForm(f => ({ ...f, tenderRef: e.target.value }))}
                    placeholder="GEM/2024/B/..." required />
                </div>
                <div>
                  <label className="field-label">Deadline <span style={{ color: "var(--status-red)" }}>*</span></label>
                  <input className="input-field" type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} required />
                </div>
              </div>
              <div>
                <label className="field-label">Issuing Department <span style={{ color: "var(--status-red)" }}>*</span></label>
                <input className="input-field" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="e.g. Ministry of Electronics & Information Technology" required />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <div className="card-header-title">AI Verification Parameters</div>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                These three parameters will be automatically extracted from each submitted bid PDF and verified against the values below.
              </p>
              <div>
                <label className="field-label">EMD Required (₹) <span style={{ color: "var(--status-red)" }}>*</span></label>
                <input className="input-field" type="number" value={form.emdRequired} onChange={e => setForm(f => ({ ...f, emdRequired: e.target.value }))} placeholder="500000" required />
                <div className="field-hint">Minimum Earnest Money Deposit in Indian Rupees</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label className="field-label">Min. Experience (Years) <span style={{ color: "var(--status-red)" }}>*</span></label>
                  <input className="input-field" type="number" value={form.minExperienceYears} onChange={e => setForm(f => ({ ...f, minExperienceYears: e.target.value }))} placeholder="5" required />
                  <div className="field-hint">Years of relevant industry experience</div>
                </div>
                <div>
                  <label className="field-label">Min. Annual Turnover (₹) <span style={{ color: "var(--status-red)" }}>*</span></label>
                  <input className="input-field" type="number" value={form.minAnnualTurnover} onChange={e => setForm(f => ({ ...f, minAnnualTurnover: e.target.value }))} placeholder="10000000" required />
                  <div className="field-hint">Minimum turnover for last financial year</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: "center", padding: "11px" }}>
              Create Tender
            </button>
            <Link to="/tenders" className="btn btn-ghost" style={{ padding: "11px 20px" }}>
              <ArrowLeft size={14} /> Cancel
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
