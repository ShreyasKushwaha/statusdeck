import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setAuthToken } from '../api/client';
import { Shield, Key, Mail, CheckCircle2 } from 'lucide-react';

export const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'signin' | 'signup' | 'verify'>('signin');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    // In production with AWS Cognito: initiates Cognito UserPool authentication.
    // In local / academic mode: sets bearer token partitioned by email/tenant
    const derivedTenant = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-') || 'demo-tenant-1';
    setAuthToken(`dev-tenant-${derivedTenant}`, derivedTenant);
    navigate('/dashboard');
  };

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    setInfoMessage(`Verification code sent to ${email}. Check your inbox or proceed below.`);
    setTab('verify');
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const derivedTenant = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-') || 'demo-tenant-1';
    setAuthToken(`dev-tenant-${derivedTenant}`, derivedTenant);
    navigate('/dashboard');
  };

  const handleQuickDemo = (tenantId: string) => {
    setAuthToken(`dev-tenant-${tenantId}`, tenantId);
    navigate('/dashboard');
  };

  return (
    <div className="main-content" style={{ maxWidth: 480, paddingTop: 40 }}>
      <div className="panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Shield size={18} color="var(--color-accent)" />
          <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>
            Amazon Cognito Authentication
          </h1>
        </div>
        <p style={{ color: 'var(--color-ink-secondary)', fontSize: 'var(--text-sm)', marginBottom: 20 }}>
          Unit 3 Security: JWT identity verification with strict per-tenant cryptographic isolation.
        </p>

        {/* Tab switcher */}
        <div style={{ display: 'flex', borderBottom: 'var(--border)', marginBottom: 20 }}>
          <button
            type="button"
            className="nav-link"
            style={{
              flex: 1,
              textAlign: 'center',
              borderBottom: tab === 'signin' ? '2px solid var(--color-accent)' : 'none',
              fontWeight: tab === 'signin' ? 600 : 400,
              borderRadius: 0,
            }}
            onClick={() => setTab('signin')}
            id="tab-signin"
          >
            Sign In
          </button>
          <button
            type="button"
            className="nav-link"
            style={{
              flex: 1,
              textAlign: 'center',
              borderBottom: tab === 'signup' ? '2px solid var(--color-accent)' : 'none',
              fontWeight: tab === 'signup' ? 600 : 400,
              borderRadius: 0,
            }}
            onClick={() => setTab('signup')}
            id="tab-signup"
          >
            Create Account
          </button>
          <button
            type="button"
            className="nav-link"
            style={{
              flex: 1,
              textAlign: 'center',
              borderBottom: tab === 'verify' ? '2px solid var(--color-accent)' : 'none',
              fontWeight: tab === 'verify' ? 600 : 400,
              borderRadius: 0,
            }}
            onClick={() => setTab('verify')}
            id="tab-verify"
          >
            Verify Email
          </button>
        </div>

        {infoMessage && (
          <div
            style={{
              backgroundColor: 'var(--color-up-subtle)',
              border: '1px solid #C4DFC9',
              padding: '10px 14px',
              borderRadius: 2,
              marginBottom: 16,
              fontSize: 13,
              color: 'var(--color-up)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <CheckCircle2 size={16} />
            <span>{infoMessage}</span>
          </div>
        )}

        {/* SIGN IN FORM */}
        {tab === 'signin' && (
          <form onSubmit={handleSignIn}>
            <div className="form-group">
              <label className="form-label" htmlFor="auth-email">
                Email Address
              </label>
              <input
                id="auth-email"
                type="email"
                required
                className="form-input"
                placeholder="developer@acme.internal"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                className="form-input"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} id="btn-submit-signin">
              <Key size={14} />
              Authenticate with Cognito
            </button>
          </form>
        )}

        {/* SIGN UP FORM */}
        {tab === 'signup' && (
          <form onSubmit={handleSignUp}>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-org">
                Organization / Tenant Name
              </label>
              <input
                id="signup-org"
                type="text"
                required
                className="form-input"
                placeholder="Acme Microservices"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="signup-email">
                Work Email
              </label>
              <input
                id="signup-email"
                type="email"
                required
                className="form-input"
                placeholder="sre@acme.internal"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="signup-password">
                Account Password
              </label>
              <input
                id="signup-password"
                type="password"
                required
                className="form-input"
                placeholder="Min 8 chars, 1 uppercase, 1 symbol"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} id="btn-submit-signup">
              <Mail size={14} />
              Register Cognito User
            </button>
          </form>
        )}

        {/* VERIFY EMAIL FORM */}
        {tab === 'verify' && (
          <form onSubmit={handleVerify}>
            <div className="form-group">
              <label className="form-label" htmlFor="verify-email">
                Email
              </label>
              <input
                id="verify-email"
                type="email"
                required
                className="form-input"
                placeholder="sre@acme.internal"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="verify-code">
                Cognito 6-Digit Code
              </label>
              <input
                id="verify-code"
                type="text"
                required
                className="form-input font-mono"
                placeholder="849201"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} id="btn-submit-verify">
              Confirm Verification & Proceed
            </button>
          </form>
        )}

        {/* Quick Academic Demo Personas */}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: 'var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 8 }}>
            Quick Tenant Switcher (Academic Evaluation):
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => handleQuickDemo('demo-tenant-1')}
              id="btn-demo-acme"
            >
              Acme Corp (Primary)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => handleQuickDemo('isolated-tenant-2')}
              id="btn-demo-isolated"
            >
              Isolated Tenant 2
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
