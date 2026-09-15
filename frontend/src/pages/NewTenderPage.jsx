import AppShell from "@/components/AppShell";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { createTender } from "@/services/procurementService";
import { ArrowLeft, Info, FileText, Upload } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export default function NewTenderPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", tenderRef: "", department: "", deadline: "",
    emdRequired: "", minExperienceYears: "", minAnnualTurnover: "",
  });
  
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy("creating");
    
    try { 
      const tender = await createTender({ 
        reference_number: form.tenderRef, 
        title: form.name, 
        department: form.department, 
        submission_deadline: form.deadline, 
        description: "", 
        requirements: [
          { title: "Earnest Money Deposit", description: `Minimum EMD required: ₹${form.emdRequired}`, category: "Financial", mandatory: true, requirement_order: 1 }, 
          { title: "Years of Experience", description: `Minimum ${form.minExperienceYears} years of relevant experience`, category: "Eligibility", mandatory: true, requirement_order: 2 }, 
          { title: "Annual Turnover", description: `Minimum annual turnover: ₹${form.minAnnualTurnover}`, category: "Financial", mandatory: true, requirement_order: 3 }
        ] 
      }); 
      
      // If a file was selected, upload it to the newly created tender
      if (file) {
        setBusy("uploading");
        const token = window.localStorage.getItem("gem_access_token");
        const formData = new FormData();
        formData.append("file", file);
        formData.append("document_type", "tender_notice");
        
        const res = await fetch(`${API_BASE_URL}/tenders/${tender.id || tender._id}/documents`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.detail || "Tender created, but notice upload failed");
        }
      }
      
      navigate(`/tenders/${tender.id || tender._id}`); 
    }
    catch (err) { 
      setError(err.message || "The procurement service is unavailable. Connect the backend before creating a tender."); 
      setBusy("");
    }
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
                  placeholder="e.g. Supply of IT Infrastructure for District Offices" required disabled={!!busy} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label className="field-label">Tender Reference No. <span style={{ color: "var(--status-red)" }}>*</span></label>
                  <input className="input-field" value={form.tenderRef} onChange={e => setForm(f => ({ ...f, tenderRef: e.target.value }))}
                    placeholder="GEM/2024/B/..." required disabled={!!busy} />
                </div>
                <div>
                  <label className="field-label">Deadline <span style={{ color: "var(--status-red)" }}>*</span></label>
                  <input className="input-field" type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} required disabled={!!busy} />
                </div>
              </div>
              <div>
                <label className="field-label">Issuing Department <span style={{ color: "var(--status-red)" }}>*</span></label>
                <input className="input-field" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="e.g. Ministry of Electronics & Information Technology" required disabled={!!busy} />
              </div>
            </div>
          </div>
          
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><div className="card-header-title">Tender notice documents</div></div>
            <div className="card-body">
              {file ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginBottom: 8, width: "100%", padding: 0 }}>
                  <FileText size={14} /> <span className="mono">{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--status-red)" }}>Remove</button>
                </div>
              ) : (
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 8 }}>No notice documents selected.</p>
              )}
              
              {!file && (
                <label className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", cursor: "pointer", marginTop: 6 }}>
                  <Upload size={14} /> Select notice PDF
                  <input type="file" accept=".pdf,.txt" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={!!busy} />
                </label>
              )}
              <div className="field-hint" style={{ marginTop: 8 }}>Thresholds (EMD, turnover, experience) are parsed from these files.</div>
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
                <input className="input-field" type="number" value={form.emdRequired} onChange={e => setForm(f => ({ ...f, emdRequired: e.target.value }))} placeholder="500000" required disabled={!!busy} />
                <div className="field-hint">Minimum Earnest Money Deposit in Indian Rupees</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label className="field-label">Min. Experience (Years) <span style={{ color: "var(--status-red)" }}>*</span></label>
                  <input className="input-field" type="number" value={form.minExperienceYears} onChange={e => setForm(f => ({ ...f, minExperienceYears: e.target.value }))} placeholder="5" required disabled={!!busy} />
                  <div className="field-hint">Years of relevant industry experience</div>
                </div>
                <div>
                  <label className="field-label">Min. Annual Turnover (₹) <span style={{ color: "var(--status-red)" }}>*</span></label>
                  <input className="input-field" type="number" value={form.minAnnualTurnover} onChange={e => setForm(f => ({ ...f, minAnnualTurnover: e.target.value }))} placeholder="10000000" required disabled={!!busy} />
                  <div className="field-hint">Minimum turnover for last financial year</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={!!busy} style={{ flex: 1, justifyContent: "center", padding: "11px" }}>
              {busy === "creating" ? "Creating..." : busy === "uploading" ? "Uploading Document..." : "Create Tender"}
            </button>
            <Link to="/tenders" className="btn btn-ghost" style={{ padding: "11px 20px", pointerEvents: busy ? "none" : "auto" }}>
              <ArrowLeft size={14} /> Cancel
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
