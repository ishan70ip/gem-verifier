import AppShell from "@/components/AppShell";
import { Link, useSearchParams } from "react-router-dom";
import { listTenders } from "@/services/procurementService";
import { apiRequest } from "@/services/apiClient";
import { useEffect, useState } from "react";
import { Search, ArrowRight, ArrowUpRight, FileText, SlidersHorizontal, ChevronDown, Calendar, Users, Database } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

function EvaluationCard({ tender }) {
  const { t } = useLanguage();
  const evaluated = tender.compliancePercentage != null;
  return (
    <div className="evq-card">
      <div className="evq-card-top">
        <span className="evq-ref">{tender.tenderRef || tender.referenceNumber}</span>
        <span className="status-pill">{tender.status || t("tenders.notProcessed")}</span>
      </div>
      <h3>{tender.name || tender.title}</h3>
      <p className="evq-dept">{tender.department || t("tenders.evDeptFallback")}</p>
      <div className="evq-rows">
        <div><Calendar size={14} /> {tender.submissionDeadline ? new Date(tender.submissionDeadline).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : t("tenders.na")}</div>
        <div><Users size={14} /> {tender.totalBids ?? 0} {t("tenders.vendors")}</div>
        <div><FileText size={14} /> {tender.requirementCount ?? 0} {t("tenders.requirements")}</div>
      </div>
      <div className="evq-foot">
        <div>
          <span>{t("tenders.evCompliance")}</span>
          <b>{evaluated ? `${tender.compliancePercentage}%` : t("tenders.evNotEvaluated")}</b>
        </div>
        <Link to={`/tenders/${tender.id}`}>
          {t("tenders.openEvaluation")} <ArrowUpRight size={14} />
        </Link>
      </div>
    </div>
  );
}

export default function TendersPage() {
  const { t } = useLanguage();
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
      tenders.map(tender =>
        apiRequest(`/tenders/${tender.id}/vendors`)
          .then(list => [tender.id, (Array.isArray(list) ? list : []).map(v => v.legalName || v.name).filter(Boolean)])
          .catch(() => [tender.id, []])
      )
    ).then(entries => { if (!cancelled) setTenderVendorNames(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [tenders]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTenders = normalizedQuery
    ? tenders.filter(tender => {
      const vendorNames = tenderVendorNames[tender.id] || [];
      return [tender.name, tender.title, tender.tenderRef, tender.referenceNumber, tender.department, tender.id, ...vendorNames]
        .filter(Boolean)
        .some(value => value.toString().toLowerCase().includes(normalizedQuery));
    })
    : tenders;

  const handleQueryChange = value => {
    setQuery(value);
    if (value.trim()) setSearchParams({ q: value.trim() }); else setSearchParams({});
  };

  const submittedBids = tenders.reduce((sum, tender) => sum + (tender.totalBids || 0), 0);

  return <AppShell>
    <main className="evaluations-page">
      <div className="section-kicker"><span className="eyebrow-line" /> {t("tenders.kicker2")}</div>
      <h1 className="evq-title">{t("tenders.title")}</h1>

      <section className="evq-stats">
        <div className="evq-stat-main">
          <span className="section-kicker">{t("tenders.evQueue")}</span>
          <h2>{t("tenders.evReadyTitle")}</h2>
          <p>{t("tenders.evReadyDesc")}</p>
        </div>
        <div className="evq-stat">
          <b>{filteredTenders.length}</b>
          <span>{t("tenders.evActiveWs")}</span>
        </div>
        <div className="evq-stat">
          <b>{submittedBids}</b>
          <span>{t("tenders.evSubmittedBids")}</span>
        </div>
        <div className="evq-stat evq-stat-note">
          <b><Database size={16} /> {t("tenders.evDbTitle")}</b>
          <span>{t("tenders.evDbSub")}</span>
        </div>
      </section>

      <section className="evaluation-toolbar"><div className="evaluation-search"><Search size={17} /><input placeholder={t("tenders.searchPlaceholder")} value={query} onChange={event => handleQueryChange(event.target.value)} /></div><button className="filter-button"><SlidersHorizontal size={15} /> {t("tenders.filters")} <ChevronDown size={14} /></button><button className="sort-button">{t("tenders.recentlyUpdated")} <ChevronDown size={14} /></button></section>
      <div className="evaluation-list-heading"><div><div className="section-kicker">{t("tenders.allWorkspaces")}</div><h2>{t("tenders.activeEvaluations")} <span>{filteredTenders.length}</span></h2></div><span className="list-note">{t("tenders.listNote")}</span></div>
      {filteredTenders.length ? <section className="evq-grid">{filteredTenders.map(tender => <EvaluationCard key={tender.id} tender={tender} />)}</section> : <section className="evaluation-table-card"><div className="empty-state"><FileText size={22} /><h3>{normalizedQuery ? `${t("tenders.noMatchPrefix")} "${query.trim()}"` : t("tenders.emptyTitle")}</h3><p>{normalizedQuery ? t("tenders.emptySearchHint") : t("tenders.emptyHint")}</p></div></section>}
    </main>
  </AppShell>;
}
