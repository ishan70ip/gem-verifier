import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { ArrowRight, Building2, FileText } from "lucide-react";
import { getVendor } from "@/services/procurementService";

export default function VendorProfilePage() {
  const { id } = useParams(); const [vendor, setVendor] = useState(null); const [loaded, setLoaded] = useState(false);
  useEffect(() => { getVendor(id).then(setVendor).catch(() => setVendor(null)).finally(() => setLoaded(true)); }, [id]);
  if (!loaded) return <AppShell><div className="page-content"><div className="card"><div className="empty-state"><h3>Loading vendor profile</h3><p>Retrieving the vendor record and awarded contracts.</p></div></div></div></AppShell>;
  if (!vendor) return <AppShell><div className="page-content"><div className="card"><div className="empty-state"><h3>Vendor profile not available</h3><p>This vendor could not be found in the central procurement database.</p><Link to="/vendors" className="btn btn-primary">Back to vendors</Link></div></div></div></AppShell>;
  const contracts = vendor.awardedContracts || [];
  return <AppShell><div className="page-bar"><div><div className="page-title">{vendor.name}</div><div className="breadcrumb"><Link to="/vendors">Vendors</Link><span className="breadcrumb-sep">/</span><span>{vendor.vendorId}</span></div></div></div><div className="page-content">
    <section className="card" style={{ marginBottom: 18 }}><div className="card-body"><div style={{ display: "flex", alignItems: "center", gap: 14 }}><div className="featured-icon"><Building2 size={22} /></div><div><h2 style={{ margin: 0, color: "var(--text-heading)" }}>{vendor.name}</h2><p style={{ margin: "5px 0 0", color: "var(--text-secondary)" }}>Vendor ID: {vendor.vendorId} · Status: {vendor.status || "Active"}</p></div></div></div></section>
    <section className="card"><div className="card-header"><div className="card-header-title">Awarded contracts <span className="chip">{contracts.length}</span></div></div>{contracts.length ? <div className="card-body" style={{ display: "grid", gap: 12 }}>{contracts.map(contract => <Link key={contract.id} to={`/contracts/${contract.id}`} className="featured-service" style={{ margin: 0, textDecoration: "none" }}><span className="featured-icon"><FileText size={20} /></span><span><b>{contract.tenderName}</b><small>{contract.tenderReference} · Awarded {contract.awardedAt || "—"} · {contract.department || "Department unavailable"}</small></span><span className="featured-cta">View contract <ArrowRight size={15} /></span></Link>)}</div> : <div className="empty-state"><FileText size={22} /><h3>No awarded contracts</h3><p>Confirmed contract assignments will appear here with their official documents.</p></div>}</section>
  </div></AppShell>;
}
