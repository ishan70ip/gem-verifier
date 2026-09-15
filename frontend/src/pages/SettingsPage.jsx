import AppShell from "@/components/AppShell";
import { Link } from "react-router-dom";
import { Key, Shield, Globe } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

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
  const { t } = useLanguage();
  return (
    <AppShell>
      <div className="page-bar">
        <div>
          <div className="page-title">{t("settings.title")}</div>
          <div className="breadcrumb" style={{ marginTop: 2 }}>
            <Link to="/">{t("settings.home")}</Link><span className="breadcrumb-sep">/</span><span>{t("settings.title")}</span>
          </div>
        </div>
      </div>

      <div className="page-content" style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
        <Section icon={<Key size={15} />} title={t("settings.aiTitle")}>
          <Row label={t("settings.llmLabel")}          desc={t("settings.llmDesc")}                         val="Google Gemini 1.5 Pro" />
          <Row label={t("settings.thresholdLabel")}  desc={t("settings.thresholdDesc")}    val="80%" />
          <Row label={t("settings.maxPagesLabel")}    desc={t("settings.maxPagesDesc")}                         val="200" />
        </Section>

        <Section icon={<Shield size={15} />} title={t("settings.securityTitle")}>
          <Row label={t("settings.retentionLabel")} desc={t("settings.retentionDesc")}   val={t("settings.retentionVal")}  valColor="var(--status-green)" />
          <Row label={t("settings.encryptionLabel")}   desc={t("settings.encryptionDesc")}          val="TLS 1.3 / AES-256" valColor="var(--status-green)" />
          <Row label={t("settings.auditLabel")}           desc={t("settings.auditDesc")}      val={t("settings.enabledVal")}         valColor="var(--status-green)" />
        </Section>

        <Section icon={<Globe size={15} />} title={t("settings.gemTitle")}>
          <Row label={t("settings.endpointLabel")}      desc={t("settings.endpointDesc")}                  val="https://gem.gov.in/api/v3" />
          <Row label={t("settings.modeLabel")}      desc={t("settings.modeDesc")}              val={t("settings.demoVal")}   valColor="var(--status-amber)" />
          <Row label={t("settings.sihLabel")} desc={t("settings.sihDesc")}                              val="#SIH26100" />
        </Section>
      </div>
    </AppShell>
  );
}
