import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { getCurrentTenantId, clearAuthToken, getAuthToken } from '../api/client';
import { Activity, ShieldCheck, Cpu, BarChart3, ExternalLink } from 'lucide-react';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const currentTenant = getCurrentTenantId();
  const token = getAuthToken();
  const isAuthenticated = Boolean(token);

  const handleLogout = () => {
    clearAuthToken();
    navigate('/auth');
  };

  return (
    <header className="ops-navbar">
      <div className="ops-navbar-inner">
        <Link to="/" className="ops-brand">
          <div className="brand-icon-box">SD</div>
          <div>
            <span className="brand-title">StatusDeck</span>
          </div>
          <span className="brand-badge">ap-south-1</span>
        </Link>

        <nav aria-label="Main Navigation">
          <ul className="nav-links">
            <li>
              <NavLink
                to="/dashboard"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                id="nav-dashboard-link"
              >
                <Activity size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
                Console
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/architecture"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                id="nav-architecture-link"
              >
                <Cpu size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
                Architecture
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/evaluation"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                id="nav-evaluation-link"
              >
                <BarChart3 size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
                Cloud Evaluation
              </NavLink>
            </li>
            <li>
              <Link
                to="/status/acme-corp"
                className="nav-link"
                target="_blank"
                rel="noreferrer"
                id="nav-public-status-link"
              >
                <ExternalLink size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
                Public Status
              </Link>
            </li>
          </ul>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isAuthenticated ? (
            <>
              <div className="tag font-mono" title="Active Tenant ID">
                <ShieldCheck size={12} />
                <span>{currentTenant}</span>
              </div>
              <button onClick={handleLogout} className="btn btn-sm" id="btn-logout">
                Sign Out
              </button>
            </>
          ) : (
            <Link to="/auth" className="btn btn-sm btn-primary" id="btn-login-nav">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};
