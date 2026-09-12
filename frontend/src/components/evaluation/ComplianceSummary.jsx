import { AlertTriangle, CheckCircle2, UsersRound } from "lucide-react";

function VendorSummary({ vendor, onOpen }) {
  const review = vendor.compliancePercentage < 90;
  return <button className={`vendor-summary-new ${review ? "review" : "good"}`} onClick={onOpen}><div className="vendor-summary-top"><span className="vendor-initials">{vendor.name.split(" ").slice(0, 2).map(word => word[0]).join("")}</span><span className="vendor-status">{review ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}{review ? "Needs review" : "Compliant"}</span></div><b>{vendor.name}</b><div className="vendor-score-new"><strong>{vendor.compliancePercentage}%</strong><span>overall compliance{vendor.riskLevel ? ` · ${vendor.riskLevel} risk` : ""}</span></div><div className="vendor-bar-new"><i style={{ width: `${vendor.compliancePercentage}%` }} /></div>{vendor.recommendation ? <small style={{ display: "block", marginTop: 6, lineHeight: 1.5, opacity: 0.85 }}>{vendor.recommendation.slice(0, 140)}{vendor.recommendation.length > 140 ? "…" : ""}</small> : null}<small>Open vendor evaluation <span>→</span></small></button>;
}

export default function ComplianceSummary({ vendors, requirements, results, lastProcessed, onOpenVendor }) {
  const compliant = results.filter(result => result.status === "COMPLIANT").length;
  const needsReview = results.filter(result => result.status === "FLAG_FOR_REVIEW" || result.status === "NOT_FOUND").length;
  const overall = results.length ? Math.round((compliant / results.length) * 100) : 0;
  return <section className="summary-section-new"><div className="summary-title-new"><div><div className="section-kicker">COMPLIANCE SUMMARY</div><h2>Overall evaluation status</h2></div><span>{lastProcessed ? `Last processed: ${lastProcessed}` : "Processing status unavailable"}</span></div><div className="summary-metrics-new"><div><UsersRound size={16} /><strong>{vendors.length}</strong><span>Vendors</span></div><div><CheckCircle2 size={16} /><strong>{requirements.length}</strong><span>Requirements</span></div><div><CheckCircle2 size={16} /><strong>{compliant}</strong><span>Compliant</span></div><div><AlertTriangle size={16} /><strong>{needsReview}</strong><span>Needs review</span></div><div className="overall-score"><strong>{overall}%</strong><span>Overall compliance</span></div></div><div className="vendor-summary-grid-new">{vendors.map(vendor => <VendorSummary key={vendor.id} vendor={vendor} onOpen={() => onOpenVendor(vendor)} />)}</div></section>;
}
