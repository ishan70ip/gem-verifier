import AppShell from "@/components/AppShell";
import { Link } from "react-router-dom";
import { Key, Shield, Globe } from "lucide-react";

function Section({ icon, title, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-title">{icon}{title}</div>
      </div>
      {children}
    </div>
  );
}

function Row({ label, desc, val, valColor = "var(--gem-navy)" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--border-light)" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-heading)", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{desc}</div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: valColor, flexShrink: 0, marginLeft: 16 }}>{val}</span>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="page-bar">
        <div>
          <div className="page-title">Settings</div>
          <div className="breadcrumb" style={{ marginTop: 2 }}>
            <Link to="/">Home</Link><span className="breadcrumb-sep">/</span><span>Settings</span>
          </div>
        </div>
      </div>

      <div className="page-content" style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
        <Section icon={<Key size={15} />} title="AI Engine Configuration">
          <Row label="LLM Provider"          desc="AI model used for document extraction"                         val="Google Gemini 1.5 Pro" />
          <Row label="Confidence Threshold"  desc="Parameters below this score are flagged for manual review"    val="80%" />
          <Row label="Max Document Pages"    desc="Maximum pages processed per document"                         val="200" />
        </Section>

        <Section icon={<Shield size={15} />} title="Security & Privacy">
          <Row label="Data Retention Policy" desc="Documents processed in-memory, never persisted to disk"   val="Zero Retention"  valColor="var(--status-green)" />
          <Row label="Encryption Standard"   desc="All uploads are end-to-end encrypted in transit"          val="TLS 1.3 / AES-256" valColor="var(--status-green)" />
          <Row label="Audit Trail"           desc="All AI decisions are immutably logged for compliance"      val="Enabled"         valColor="var(--status-green)" />
        </Section>

        <Section icon={<Globe size={15} />} title="GeM Portal Integration">
          <Row label="GeM API Endpoint"      desc="Government e-Marketplace API base URL"                  val="https://gem.gov.in/api/v3" />
          <Row label="Integration Mode"      desc="Connection to live GeM procurement portal"              val="Demo Mode"   valColor="var(--status-amber)" />
          <Row label="SIH Problem Statement" desc="Smart India Hackathon 2026"                              val="#SIH26100" />
        </Section>
      </div>
    </AppShell>
  );
}
