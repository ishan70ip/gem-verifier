import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { Building2, Search, ArrowRight, UsersRound } from "lucide-react";
import { listVendors } from "@/services/procurementService";

export default function VendorsPage() {
  const [vendors, setVendors] = useState([]);
  const [query, setQuery] = useState("");
  useEffect(() => { listVendors().then(data => setVendors(Array.isArray(data) ? data : data?.items || [])).catch(() => setVendors([])); }, []);
  const filtered = vendors.filter(vendor => `${vendor.name} ${vendor.vendorId}`.toLowerCase().includes(query.toLowerCase()));
  return <AppShell><div className="page-bar"><div><div className="page-title">Vendors</div><div className="breadcrumb"><Link to="/">Home</Link><span className="breadcrumb-sep">/</span><span>Vendors</span></div></div></div><div className="page-content">
    <div className="card" style={{ marginBottom: 18 }}><div className="card-header"><div><div className="card-header-title">Awarded vendor directory</div><div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 12 }}>Vendor profiles are created from confirmed contract awards.</div></div><div className="evaluation-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search vendors" /></div></div></div>
    {filtered.length ? <div className="evaluation-grid">{filtered.map(vendor => <Link to={`/vendors/${vendor.id}`} key={vendor.id} className="evaluation-card" style={{ textDecoration: "none" }}><div className="evaluation-card-top"><div className="evaluation-icon"><Building2 size={20} /></div><span className="status-pill">{vendor.status || "Active"}</span></div><h3>{vendor.name}</h3><div className="evaluation-id">{vendor.vendorId}</div><div className="evaluation-meta"><span>{vendor.awardedContractsCount ?? "—"} awarded contracts</span></div><div className="evaluation-card-footer"><span>Vendor profile</span><span>View profile <ArrowRight size={14} /></span></div></Link>)}</div> : <div className="card"><div className="empty-state"><UsersRound size={22} /><h3>No vendor profiles available</h3><p>Vendors will appear here after a contract is assigned from a completed evaluation.</p></div></div>}
  </div></AppShell>;
}
