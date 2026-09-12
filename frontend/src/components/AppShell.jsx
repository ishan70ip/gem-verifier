import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, HelpCircle, Bell, ChevronDown, RefreshCw, LogOut, UserCheck, Building2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const officerLinks = [
  { label: "Home", to: "/" },
  { label: "Evaluations", to: "/tenders" },
  { label: "Vendors", to: "/vendors" },
];

const vendorLinks = [
  { label: "Vendor Workspace", to: "/vendor/dashboard" },
];

export default function AppShell({ children, noPadding = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isVendor = user?.role === "vendor";
  const links = isVendor ? vendorLinks : officerLinks;

  const displayName = user?.name || (isVendor ? "Acme Procurement Systems" : "Arjun Sharma");
  const displayRole = isVendor ? "Registered Vendor" : "Procurement Officer";
  const avatarInitials = isVendor ? "AC" : "AS";

  return (
    <div className="app-shell">
      <div className="gov-strip">
        <div>Government e-Marketplace · Ministry of Commerce &amp; Industry</div>
        <div className="gov-strip-right">
          <span>भारत सरकार</span>
          <span>Skip to main content</span>
          <span>अ | A</span>
        </div>
      </div>

      <header className="site-header">
        <Link to={isVendor ? "/vendor/dashboard" : "/"} className="brand-lockup">
          <div className="brand-mark">
            <img src="/gem-mark.png" alt="GeM" />
          </div>
          <div className="brand-copy">
            <strong>GeM</strong>
            <span>Bid Compliance Verification</span>
          </div>
          <div className="brand-divider" />
          <div className="brand-dept">
            <b>Government e-Marketplace</b>
            <span>Smarter procurement. Stronger compliance.</span>
          </div>
        </Link>

        <div className="header-tools">
          <label className="header-search">
            <Search size={16} />
            <input placeholder="Search evaluations" />
            <kbd>⌘ K</kbd>
          </label>

          <button className="icon-button" aria-label="Help">
            <HelpCircle size={19} />
          </button>

          <button className="icon-button notification" aria-label="Notifications">
            <Bell size={18} />
            <i />
          </button>

          <button className="language">
            <span>अ</span> English <ChevronDown size={14} />
          </button>

          {user ? (
            <div className="header-profile-box">
              <div className="profile-pill">
                <div className="avatar">{avatarInitials}</div>
                <div className="profile-info">
                  <b className="user-name">{displayName}</b>
                  <span className="user-role">{displayRole}</span>
                </div>
              </div>
              <button onClick={handleLogout} className="header-logout-btn" title="Sign Out">
                <LogOut size={15} />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <Link to="/login" className="login-link-btn">
              Sign In
            </Link>
          )}
        </div>
      </header>

      <nav className="top-nav">
        <div className="nav-inner">
          <div className="nav-links">
            {links.map((link) => (
              <Link
                key={link.label}
                className={
                  (link.label === "Evaluations" && location.pathname.startsWith("/tenders")) ||
                  (link.label !== "Vendors" && link.label !== "Evaluations" && location.pathname === link.to)
                    ? "active"
                    : ""
                }
                to={link.to}
              >
                {link.label}
                {link.label === "Evaluations" && <ChevronDown size={14} />}
              </Link>
            ))}
          </div>

          <div className="nav-right-controls">
            <div className="nav-status">
              <span className="status-dot" /> Engine operational <RefreshCw size={13} />
            </div>
            {user && (
              <button onClick={handleLogout} className="navbar-logout-btn">
                <LogOut size={13} /> Logout ({user.email})
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className={noPadding ? "app-main no-padding" : "app-main"}>{children}</main>

      <footer className="site-footer">
        <div>
          <b>GeM Bid Compliance Verification</b>
          <span>Evidence-based evaluation for transparent public procurement</span>
        </div>
        <div className="footer-links">
          <span>Privacy</span>
          <span>Help &amp; Support</span>
          <span>Version 1.0</span>
        </div>
      </footer>
    </div>
  );
}
