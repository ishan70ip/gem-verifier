import AppShell from "@/components/AppShell";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { createTender } from "@/services/procurementService";
import { ArrowLeft, Info, FileText, Upload } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export default function NewTenderPage() {
  const { t } = useLanguage();
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
          throw new Error(errJson.detail || t("newTender.noticeUploadFailed"));
        }
      }
      
      navigate(`/tenders/${tender.id || tender._id}`); 
    }
    catch (err) { 
      setError(err.message || t("newTender.serviceUnavailable")); 
      setBusy("");
    }
  };

  return (
    <AppShell>
      <div className="page-bar">
        <div>
          <div className="page-title">{t("newTender.pageTitle")}</div>
          <div className="breadcrumb" style={{ marginTop: 2 }}>
            <Link to="/">{t("newTender.home")}</Link><span className="breadcrumb-sep">/</span>
            <Link to="/tenders">{t("newTender.tenders")}</Link><span className="breadcrumb-sep">/</span>
            <span>{t("newTender.newTenderCrumb")}</span>
          </div>
        </div>
      </div>

      <div className="page-content" style={{ maxWidth: 680 }}>
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            {t("newTender.infoBanner")}
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 20 }}><Info size={14} />{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-header-title">{t("newTender.identityTitle")}</div>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="field-label">{t("newTender.nameLabel")} <span style={{ color: "var(--status-red)" }}>*</span></label>
                <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={t("newTender.namePlaceholder")} required disabled={!!busy} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label className="field-label">{t("newTender.refLabel")} <span style={{ color: "var(--status-red)" }}>*</span></label>
                  <input className="input-field" value={form.tenderRef} onChange={e => setForm(f => ({ ...f, tenderRef: e.target.value }))}
                    placeholder={t("newTender.refPlaceholder")} required disabled={!!busy} />
                </div>
                <div>
                  <label className="field-label">{t("newTender.deadlineLabel")} <span style={{ color: "var(--status-red)" }}>*</span></label>
                  <input className="input-field" type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} required disabled={!!busy} />
                </div>
              </div>
              <div>
                <label className="field-label">{t("newTender.departmentLabel")} <span style={{ color: "var(--status-red)" }}>*</span></label>
                <input className="input-field" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  placeholder={t("newTender.departmentPlaceholder")} required disabled={!!busy} />
              </div>
            </div>
          </div>
          
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><div className="card-header-title">{t("newTender.noticeTitle")}</div></div>
            <div className="card-body">
              {file ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginBottom: 8, width: "100%", padding: 0 }}>
                  <FileText size={14} /> <span className="mono">{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--status-red)" }}>{t("newTender.removeFile")}</button>
                </div>
              ) : (
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 8 }}>{t("newTender.noNotice")}</p>
              )}
              
              {!file && (
                <label className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", cursor: "pointer", marginTop: 6 }}>
                  <Upload size={14} /> {t("newTender.selectNotice")}
                  <input type="file" accept=".pdf,.txt" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={!!busy} />
                </label>
              )}
              <div className="field-hint" style={{ marginTop: 8 }}>{t("newTender.noticeHint")}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <div className="card-header-title">{t("newTender.paramsTitle")}</div>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {t("newTender.paramsDesc")}
              </p>
              <div>
                <label className="field-label">{t("newTender.emdLabel")} <span style={{ color: "var(--status-red)" }}>*</span></label>
                <input className="input-field" type="number" value={form.emdRequired} onChange={e => setForm(f => ({ ...f, emdRequired: e.target.value }))} placeholder="500000" required disabled={!!busy} />
                <div className="field-hint">{t("newTender.emdHint")}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label className="field-label">{t("newTender.experienceLabel")} <span style={{ color: "var(--status-red)" }}>*</span></label>
                  <input className="input-field" type="number" value={form.minExperienceYears} onChange={e => setForm(f => ({ ...f, minExperienceYears: e.target.value }))} placeholder="5" required disabled={!!busy} />
                  <div className="field-hint">{t("newTender.experienceHint")}</div>
                </div>
                <div>
                  <label className="field-label">{t("newTender.turnoverLabel")} <span style={{ color: "var(--status-red)" }}>*</span></label>
                  <input className="input-field" type="number" value={form.minAnnualTurnover} onChange={e => setForm(f => ({ ...f, minAnnualTurnover: e.target.value }))} placeholder="10000000" required disabled={!!busy} />
                  <div className="field-hint">{t("newTender.turnoverHint")}</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={!!busy} style={{ flex: 1, justifyContent: "center", padding: "11px" }}>
              {busy === "creating" ? t("newTender.creating") : busy === "uploading" ? t("newTender.uploading") : t("newTender.createTender")}
            </button>
            <Link to="/tenders" className="btn btn-ghost" style={{ padding: "11px 20px", pointerEvents: busy ? "none" : "auto" }}>
              <ArrowLeft size={14} /> {t("newTender.cancel")}
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
