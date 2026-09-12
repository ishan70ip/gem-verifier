import { useState, useEffect } from "react";
import AppShell from "../components/AppShell";
import StatusBadge from "../components/StatusBadge";
import { Link } from "react-router-dom";
import { apiRequest } from "../services/apiClient";
import { subscribeToTable, isRealtimeEnabled } from "../lib/supabase";
import { ArrowRight, ArrowUpRight, FilePlus2, FolderOpen, UsersRound, Search, ShieldCheck, Sparkles, Activity, FileText, Clock } from "lucide-react";

const services = [
  { icon: FilePlus2, label: "New evaluation", text: "Start with a GeM tender", to: "/tenders/new", tone: "orange" },
  { icon: FolderOpen, label: "Evaluations", text: "Review completed work", to: "/tenders", tone: "blue" },
  { icon: UsersRound, label: "Vendors", text: "View awarded vendors", to: "/vendors", tone: "green" },
];

export default function Dashboard() {
  const [stats, setStats] = useState({ tenders: 0, evaluations: 0, in_progress: 0, needs_review: 0, awards: 0 });
  const [tenders, setTenders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        const [dashRes, tendRes] = await Promise.allSettled([
          apiRequest("/officer/dashboard"),
          apiRequest("/tenders"),
        ]);

        if (dashRes.status === "fulfilled" && dashRes.value) {
          setStats(dashRes.value);
        }
        if (tendRes.status === "fulfilled" && Array.isArray(tendRes.value)) {
          setTenders(tendRes.value);
        }
      } catch (err) {
        console.error("Dashboard fetch failed", err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
    // Live updates when Supabase Realtime is configured: a vendor submitting
    // a bid on another device refreshes this dashboard with no reload.
    if (!isRealtimeEnabled()) return undefined;
    const refresh = () => loadDashboardData();
    const offBids = subscribeToTable("bids", refresh);
    const offEvals = subscribeToTable("evaluations", refresh);
    return () => { offBids(); offEvals(); };
  }, []);

  return (
    <AppShell>
      <section className="welcome-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-line" /> PROCUREMENT INTELLIGENCE PLATFORM
          </div>
          <h1>
            From tenders<br />
            <em>to trust.</em>
          </h1>
          <p>AI-assisted bid compliance verification for faster, fairer and more transparent public procurement.</p>
          <div className="hero-actions">
            <Link to="/tenders/new" className="primary-action">
              <FilePlus2 size={18} /> New evaluation <ArrowRight size={16} />
            </Link>
            <Link to="/tenders" className="secondary-action">
              Explore evaluations <ArrowUpRight size={16} />
            </Link>
          </div>
          <label className="hero-search">
            <Search size={19} />
            <input placeholder="Search by tender name, ID or vendor" />
            <span>Search</span>
          </label>
        </div>
      </section>

      <section className="portal-home">
        <div className="portal-heading">
          <div>
            <div className="section-kicker">PROCUREMENT WORKSPACE</div>
            <h2>Your procurement workspace</h2>
          </div>
          <div className="portal-date">
            <span className="live-dot" /> {isRealtimeEnabled() ? "Live sync connected" : "System operational"}
          </div>
        </div>

        <div className="command-layout">
          <div className="services-surface">
            <div className="surface-heading">
              <div>
                <span className="surface-index">01</span>
                <div>
                  <div className="section-kicker">CORE SERVICES</div>
                  <h3>What would you like to do today?</h3>
                </div>
              </div>
              <span className="surface-caption">A clear starting point for every evaluation</span>
            </div>
            <div className="service-tiles">
              {services.map(({ icon: Icon, label, text, to, tone }) => (
                <Link className={`service-tile ${tone}`} to={to} key={label}>
                  <div className="tile-icon">
                    <Icon size={21} />
                  </div>
                  <div className="tile-copy">
                    <h4>{label}</h4>
                    <p>{text}</p>
                  </div>
                  <ArrowUpRight size={16} className="tile-arrow" />
                </Link>
              ))}
            </div>
            <Link to="/tenders/new" className="featured-service">
              <span className="featured-icon">
                <FilePlus2 size={22} />
              </span>
              <span>
                <b>Create a new evaluation</b>
                <small>Register a tender and review vendor submissions received through the vendor portal.</small>
              </span>
              <span className="featured-cta">
                Begin <ArrowRight size={15} />
              </span>
            </Link>
          </div>

          <aside className="insight-stack">
            <div className="today-card">
              <div className="today-top">
                <span className="surface-index">02</span>
                <span className="section-kicker">DATA STATUS</span>
              </div>
              <div className="today-number">{stats.needs_review}</div>
              <h3>Items Needing Review</h3>
              <p>Compliance items requiring officer resolution.</p>
              <Link to="/tenders" className="light-link">
                Open evaluations <ArrowRight size={14} />
              </Link>
              <div className="review-foot">
                <span>Human-in-the-loop</span>
                <span>Active Database</span>
              </div>
            </div>
          </aside>
        </div>

        <section className="evaluations-surface">
          <div className="surface-heading evaluations-heading">
            <div>
              <span className="surface-index">03</span>
              <div>
                <div className="section-kicker">WORKSPACE ACTIVITY</div>
                <h3>Recent evaluations &amp; tenders</h3>
              </div>
            </div>
            <Link to="/tenders" className="surface-link">
              View all evaluations <ArrowRight size={15} />
            </Link>
          </div>
          <div className="activity-strip">
            <div>
              <FileText size={16} />
              <b>{stats.tenders}</b>
              <span>Total Tenders</span>
            </div>
            <div>
              <Activity size={16} />
              <b>{stats.evaluations}</b>
              <span>Active Evaluations</span>
            </div>
            <div>
              <ShieldCheck size={16} />
              <b>{stats.awards}</b>
              <span>Awarded Contracts</span>
            </div>
            <div className="activity-note">
              <Activity size={16} />
              <span>
                Database Sync<br />
                <b>Operational</b>
              </span>
            </div>
          </div>

          <div className="table-wrap">
            {tenders.length === 0 ? (
              <div className="empty-state">
                <FileText size={22} />
                <h3>No recent tenders found</h3>
                <p>Create a new tender to begin evaluating bid compliance.</p>
              </div>
            ) : (
              <table className="evaluations-table">
                <thead>
                  <tr>
                    <th>Reference No</th>
                    <th>Tender Title</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Deadline</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenders.map((t) => (
                    <tr key={t.id || t._id}>
                      <td>
                        <strong>{t.referenceNumber || t.tenderRef || t.id}</strong>
                      </td>
                      <td>{t.title || t.name}</td>
                      <td>{t.department}</td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td>
                        {t.submissionDeadline || t.deadline
                          ? new Date(t.submissionDeadline || t.deadline).toLocaleDateString()
                          : "N/A"}
                      </td>
                      <td>
                        <Link to={`/tenders/${t.id || t._id}`} className="table-action-link">
                          View Tender <ArrowRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <div className="accountability-banner">
          <div className="accountability-symbol">
            <Sparkles size={18} />
          </div>
          <div>
            <b>Evidence-based by design</b>
            <span>Every decision connects the tender requirement to vendor evidence, source document and rule applied.</span>
          </div>
          <Link to="/tenders">Explore the evidence chain <ArrowRight size={15} /></Link>
        </div>
      </section>
    </AppShell>
  );
}
