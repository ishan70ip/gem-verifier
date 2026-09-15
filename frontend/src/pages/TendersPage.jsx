import AppShell from "@/components/AppShell";
import { Link, useSearchParams } from "react-router-dom";
import { listTenders } from "@/services/procurementService";
import { apiRequest } from "@/services/apiClient";
import { useEffect, useState } from "react";
import { Search, Plus, ArrowRight, FileText, SlidersHorizontal, ChevronDown } from "lucide-react";

function EvaluationCard({ tender }) {
  return (
    <div className="evaluation-card">
      <div className="evaluation-card-top">
        <div className="evaluation-icon">
          <FileText size={20} />
        </div>
        <span className="status-pill">
          {tender.status || "Not processed"}
        </span>
      </div>
      
      <h3>{tender.name || tender.title}</h3>
      <div className="evaluation-id">{tender.tenderRef || tender.referenceNumber}</div>
      
      <div className="evaluation-meta">
        <span>{tender.department}</span>
        <span>
          Deadline {tender.submissionDeadline 
            ? new Date(tender.submissionDeadline).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) 
            : "N/A"}
        </span>
      </div>
      
      <div className="evaluation-divider" />
      
      <div className="evaluation-numbers">
        <div>
          <b>{tender.totalBids ?? "—"}</b>
          <span>Vendors</span>
        </div>
        <div>
          <b>{tender.requirementCount ?? "—"}</b>
          <span>Requirements</span>
        </div>
        <div>
          <b>{tender.compliancePercentage != null ? `${tender.compliancePercentage}%` : "—"}</b>
          <span>Compliant</span>
        </div>
      </div>
      
      <div className="evaluation-progress">
        <span style={{ width: `${tender.compliancePercentage || 0}%` }} />
      </div>
      
      <div className="evaluation-card-footer">
        <span>{tender.updatedAt ? new Date(tender.updatedAt).toLocaleDateString() : "Not processed"}</span>
        <Link to={`/tenders/${tender.id}`}>
          Open evaluation <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

export default function TendersPage() {
  const [tenders, setTenders] = useState([]);
  const [tenderVendorNames, setTenderVendorNames] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");

  useEffect(() => { listTenders().then(data => setTenders(Array.isArray(data) ? data : data?.items || [])).catch(() => setTenders([])); }, []);

  // Keep the box in sync if someone lands here with ?q= from the header search.
  useEffect(() => { setQuery(searchParams.get("q") || ""); }, [searchParams]);

  // Tender records don't carry vendor names directly, so fetch each
  // tender's bidding vendors once the list loads (enables "search by
  // vendor name", not just tender title/reference).
  useEffect(() => {
    if (!tenders.length) return undefined;
    let cancelled = false;
    Promise.all(
      tenders.map(t =>
        apiRequest(`/tenders/${t.id}/vendors`)
          .then(list => [t.id, (Array.isArray(list) ? list : []).map(v => v.legalName || v.name).filter(Boolean)])
          .catch(() => [t.id, []])
      )
    ).then(entries => { if (!cancelled) setTenderVendorNames(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [tenders]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTenders = normalizedQuery
    ? tenders.filter(t => {
      const vendorNames = tenderVendorNames[t.id] || [];
      return [t.name, t.title, t.tenderRef, t.referenceNumber, t.department, t.id, ...vendorNames]
        .filter(Boolean)
        .some(value => value.toString().toLowerCase().includes(normalizedQuery));
    })
    : tenders;

  const handleQueryChange = value => {
    setQuery(value);
    if (value.trim()) setSearchParams({ q: value.trim() }); else setSearchParams({});
  };

  return <AppShell>
    <main className="evaluations-page">
      <section className="evaluation-page-head"><div><div className="section-kicker"><span className="eyebrow-line" /> WORKSPACE / EVALUATIONS</div><h1>Evaluations</h1><p>Review tender requirements, vendor bids and evidence-backed compliance decisions.</p></div><Link to="/tenders/new" className="evaluation-primary"><Plus size={17} /> New evaluation</Link></section>
      <section className="evaluation-summary"><div className="summary-lead"><span className="summary-emblem"><FileText size={18} /></span><div><b>{filteredTenders.length}</b><span>{normalizedQuery ? "Matching evaluations" : "Total evaluations"}</span></div></div><div className="summary-action"><span>Data source</span><b>Central procurement database</b></div></section>
      <section className="evaluation-toolbar"><div className="evaluation-search"><Search size={17} /><input placeholder="Search by tender name, reference number or vendor" value={query} onChange={event => handleQueryChange(event.target.value)} /></div><button className="filter-button"><SlidersHorizontal size={15} /> Filters <ChevronDown size={14} /></button><button className="sort-button">Recently updated <ChevronDown size={14} /></button></section>
      <div className="evaluation-list-heading"><div><div className="section-kicker">ALL WORKSPACES</div><h2>Active evaluations <span>{filteredTenders.length}</span></h2></div><span className="list-note">Records are loaded from the central procurement database</span></div>
      {filteredTenders.length ? <section className="evaluation-grid">{filteredTenders.map(tender => <EvaluationCard key={tender.id} tender={tender} />)}</section> : <section className="evaluation-table-card"><div className="empty-state"><FileText size={22} /><h3>{normalizedQuery ? `No evaluations match "${query.trim()}"` : "No evaluations available"}</h3><p>{normalizedQuery ? "Try a different tender name, reference number or vendor." : "Evaluations will appear here after they are created in the connected procurement system."}</p>{!normalizedQuery && <Link to="/tenders/new" className="evaluation-primary"><Plus size={17} /> New evaluation</Link>}</div></section>}
    </main>
  </AppShell>;
}