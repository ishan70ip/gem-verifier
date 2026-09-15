import { AlertTriangle, CheckCircle2, FileText, UsersRound } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";

function VendorSummary({ vendor, docs, onOpen, onViewDocuments }) {
  const { t } = useLanguage();
  const review = vendor.compliancePercentage < 90;

  return (
    <div
      className={`vendor-summary-new ${review ? "review" : "good"}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={event => (event.key === "Enter" || event.key === " ") && onOpen()}
    >
      <div className="vendor-summary-top">
        <span className="vendor-initials">
          {vendor.name.split(" ").slice(0, 2).map(word => word[0]).join("")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            className="vendor-doc-btn"
            onClick={event => { event.stopPropagation(); onViewDocuments(docs); }}
          >
            <FileText size={11} /> {t("evalSummary.documents")}{docs.length ? ` (${docs.length})` : ""}
          </button>
          <span className="vendor-status">
            {review ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
            {review ? t("evalSummary.needsReview") : t("evalSummary.compliant")}
          </span>
        </span>
      </div>

      <b>{vendor.name}</b>

      <div className="vendor-score-new">
        <strong>{vendor.compliancePercentage}%</strong>
        <span>{t("evalSummary.overallCompliance")}{vendor.riskLevel ? ` · ${vendor.riskLevel} ${t("evalSummary.riskUnit")}` : ""}</span>
      </div>

      <div className="vendor-bar-new">
        <i style={{ width: `${vendor.compliancePercentage}%` }} />
      </div>

      {vendor.recommendation ? (
        <small style={{ display: "block", marginTop: 6, lineHeight: 1.5, opacity: 0.85 }}>
          {vendor.recommendation.slice(0, 140)}
          {vendor.recommendation.length > 140 ? "…" : ""}
        </small>
      ) : null}

      <small>{t("evalSummary.openVendor")} <span>→</span></small>
    </div>
  );
}

export default function ComplianceSummary({
  vendors,
  requirements,
  results,
  documents = [],
  lastProcessed,
  onOpenVendor,
  onViewVendorDocuments,
}) {
  const { t } = useLanguage();
  const compliant = results.filter(result => result.status === "COMPLIANT").length;
  const needsReview = results.filter(
    result => result.status === "FLAG_FOR_REVIEW" || result.status === "NOT_FOUND"
  ).length;
  const overall = results.length ? Math.round((compliant / results.length) * 100) : 0;

  return (
    <section className="summary-section-new">
      <div className="summary-title-new">
        <div>
          <div className="section-kicker">{t("evalSummary.kicker")}</div>
          <h2>{t("evalSummary.title")}</h2>
        </div>
        <span>
          {lastProcessed
            ? `${t("evalSummary.lastProcessedLabel")} ${lastProcessed}`
            : t("evalSummary.processingUnavailable")}
        </span>
      </div>

      <div className="summary-metrics-new">
        <div>
          <UsersRound size={16} />
          <strong>{vendors.length}</strong>
          <span>{t("evalSummary.vendors")}</span>
        </div>
        <div>
          <CheckCircle2 size={16} />
          <strong>{requirements.length}</strong>
          <span>{t("evalSummary.requirements")}</span>
        </div>
        <div>
          <CheckCircle2 size={16} />
          <strong>{compliant}</strong>
          <span>{t("evalSummary.compliant")}</span>
        </div>
        <div>
          <AlertTriangle size={16} />
          <strong>{needsReview}</strong>
          <span>{t("evalSummary.needsReview")}</span>
        </div>
        <div className="overall-score">
          <strong>{overall}%</strong>
          <span>{t("evalSummary.overallComplianceMetric")}</span>
        </div>
      </div>

      <div className="vendor-summary-grid-new">
        {vendors.map(vendor => (
          <VendorSummary
            key={vendor.id}
            vendor={vendor}
            docs={documents.filter(doc => doc.bidId === vendor.bid?.id)}
            onOpen={() => onOpenVendor(vendor)}
            onViewDocuments={docs => onViewVendorDocuments(vendor, docs)}
          />
        ))}
      </div>
    </section>
  );
}