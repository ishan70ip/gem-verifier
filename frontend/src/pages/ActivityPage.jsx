import AppShell from "@/components/AppShell";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { listActivity } from "@/services/procurementService";
import { useLanguage } from "../context/LanguageContext";
import { Activity, Brain, Upload, FileText, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

function buildTimeline(bid, translate) {
  const base = new Date(bid.uploadedAt);
  const t = (offsetSec) =>
    new Date(base.getTime() + offsetSec * 1000)
      .toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const aiParams  = bid.parameters.filter(p => p.category === "AI_VERIFIED");
  const compliant = aiParams.filter(p => p.status === "COMPLIANT").length;
  const flagged   = aiParams.filter(p => p.status === "FLAG_FOR_REVIEW" || p.status === "NOT_FOUND").length;

  if (bid.status === "FAILED") {
    return [
      { icon: Upload,       color: "var(--gem-navy)", label: translate("activity.uploaded"),  detail: bid.pdfName,                          time: t(0) },
      { icon: FileText,     color: "#0369A1",         label: translate("activity.parseFailed"), detail: bid.failureReason ?? translate("activity.unknownError"), time: t(8) },
    ];
  }

  return [
    { icon: Upload,       color: "var(--gem-navy)", label: translate("activity.uploaded"),          detail: bid.pdfName,                                    time: t(0) },
    { icon: FileText,     color: "#0369A1",         label: translate("activity.parsed"),                detail: translate("activity.pagesProcessed"),           time: t(6) },
    { icon: Brain,        color: "#7C3AED",         label: translate("activity.aiExtraction"),     detail: `${aiParams.length} ${translate("activity.parametersIdentified")}`,     time: t(44) },
    { icon: CheckCircle2, color: "#15803D",         label: translate("activity.verificationDone"), detail: `${compliant} ${translate("activity.satisfied")} · ${flagged} ${translate("activity.flagged")}`, time: t(62) },
    ...(flagged > 0 ? [{ icon: AlertTriangle, color: "#B45309", label: translate("activity.reviewAssigned"), detail: `${flagged} ${translate("activity.manualVerification")}`, time: t(63) }] : []),
  ];
}

export default function ActivityPage() {
  const { t } = useLanguage();
  const [events, setEvents] = useState([]);
  useEffect(() => { listActivity().then(data => setEvents(Array.isArray(data) ? data : data?.items || [])).catch(() => setEvents([])); }, []);
  return (
    <AppShell>
      <div className="page-bar">
        <div>
          <div className="page-title">{t("activity.title")}</div>
          <div className="breadcrumb" style={{ marginTop: 2 }}>
            <Link to="/">{t("activity.home")}</Link><span className="breadcrumb-sep">/</span><span>{t("activity.crumb")}</span>
          </div>
        </div>
      </div>

      <div className="page-content">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#F8FAFC", border: "1px solid var(--border-light)", borderLeft: "4px solid var(--gem-navy)", borderRadius: 6, marginBottom: 20 }}>
          <Activity size={14} color="var(--gem-navy)" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "var(--text-body)", lineHeight: 1.5 }}>
            {t("activity.banner")}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, padding: "3px 10px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 4, color: "var(--gem-navy)", flexShrink: 0 }}>
            {events.length} {t("activity.recordedEvents")}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {events.map(event => {
            const bid = event.bid || event;
            const events = buildTimeline(bid, t);
            const overallColor = bid.overallCompliance === "COMPLIANT" ? "#15803D"
              : bid.overallCompliance === "NON_COMPLIANT" ? "#DC2626"
              : bid.status === "FAILED" ? "#6B7280" : "#B45309";

            return (
              <div key={event.id || bid.id} className="card">
                <div className="card-header">
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-heading)" }}>{bid.companyName}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: "monospace" }}>
                      {bid.pdfName} · {formatDate(bid.uploadedAt)}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", background: overallColor + "15", border: `1px solid ${overallColor}30`, borderRadius: 4, color: overallColor }}>
                      {bid.status === "FAILED" ? "FAILED" : bid.overallCompliance.replace("_", " ")}
                    </span>
                    {bid.status !== "FAILED" && (
                      <Link to={`/bids/${bid.id}`} className="row-action">{t("activity.viewAnalysis")}</Link>
                    )}
                  </div>
                </div>

                <div style={{ padding: "16px 20px" }}>
                  {events.map((ev, i) => (
                    <div key={i} style={{ display: "flex", gap: 14 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: ev.color + "15", border: `1.5px solid ${ev.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1 }}>
                          <ev.icon size={14} color={ev.color} />
                        </div>
                        {i < events.length - 1 && <div style={{ width: 1, flex: 1, minHeight: 20, background: "var(--border-light)", marginTop: 4 }} />}
                      </div>
                      <div style={{ flex: 1, paddingBottom: i < events.length - 1 ? 14 : 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-heading)" }}>{ev.label}</span>
                          <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", marginLeft: "auto", flexShrink: 0 }}>
                            <Clock size={10} style={{ display: "inline", marginRight: 3 }} />{ev.time}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{ev.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
