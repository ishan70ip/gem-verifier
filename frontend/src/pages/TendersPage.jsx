import AppShell from "@/components/AppShell";
import { Link } from "react-router-dom";
import { listTenders } from "@/services/procurementService";
import { useEffect, useState } from "react";
import { Search, Plus, ArrowRight, FileText, SlidersHorizontal, ChevronDown } from "lucide-react";

function EvaluationCard({ tender }) {
  return <div className="evaluation-card"><div className="evaluation-card-top"><div className="evaluation-icon"><FileText size={20} /></div><span className="status-pill">{tender.status || "Not processed"}</span></div><h3>{tender.name}</h3><div className="evaluation-id">{tender.tenderRef}</div><div className="evaluation-meta"><span>{tender.department}</span><span>Deadline {tender.deadline}</span></div><div className="evaluation-divider" /><div className="evaluation-numbers"><div><b>{tender.totalBids ?? "—"}</b><span>Vendors</span></div><div><b>{tender.requirementCount ?? "—"}</b><span>Requirements</span></div><div><b>{tender.compliancePercentage != null ? `${tender.compliancePercentage}%` : "—"}</b><span>Compliant</span></div></div><div className="evaluation-progress"><span style={{ width: `${tender.compliancePercentage || 0}%` }} /></div><div className="evaluation-card-footer"><span>{tender.updatedAt || "Not processed"}</span><Link to={`/tenders/${tender.id}`}>Open evaluation <ArrowRight size={14} /></Link></div></div>;
}

export default function TendersPage() {
  const [tenders, setTenders] = useState([]);
  useEffect(() => { listTenders().then(data => setTenders(Array.isArray(data) ? data : data?.items || [])).catch(() => setTenders([])); }, []);
  return <AppShell>
    <main className="evaluations-page">
      <section className="evaluation-page-head"><div><div className="section-kicker"><span className="eyebrow-line" /> WORKSPACE / EVALUATIONS</div><h1>Evaluations</h1><p>Review tender requirements, vendor bids and evidence-backed compliance decisions.</p></div><Link to="/tenders/new" className="evaluation-primary"><Plus size={17} /> New evaluation</Link></section>
      <section className="evaluation-summary"><div className="summary-lead"><span className="summary-emblem"><FileText size={18} /></span><div><b>{tenders.length}</b><span>Total evaluations</span></div></div><div className="summary-action"><span>Data source</span><b>Central procurement database</b></div></section>
      <section className="evaluation-toolbar"><div className="evaluation-search"><Search size={17} /><input placeholder="Search by tender name or reference number" /></div><button className="filter-button"><SlidersHorizontal size={15} /> Filters <ChevronDown size={14} /></button><button className="sort-button">Recently updated <ChevronDown size={14} /></button></section>
      <div className="evaluation-list-heading"><div><div className="section-kicker">ALL WORKSPACES</div><h2>Active evaluations <span>{tenders.length}</span></h2></div><span className="list-note">Records are loaded from the central procurement database</span></div>
      {tenders.length ? <section className="evaluation-grid">{tenders.map(tender => <EvaluationCard key={tender.id} tender={tender} />)}</section> : <section className="evaluation-table-card"><div className="empty-state"><FileText size={22} /><h3>No evaluations available</h3><p>Evaluations will appear here after they are created in the connected procurement system.</p><Link to="/tenders/new" className="evaluation-primary"><Plus size={17} /> New evaluation</Link></div></section>}
    </main>
  </AppShell>;
}
