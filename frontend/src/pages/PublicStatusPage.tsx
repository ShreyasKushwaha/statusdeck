import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { StatusPip } from '../components/StatusPip';
import { UptimeBar90Days, DayBar } from '../components/UptimeBar90Days';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, ArrowLeft } from 'lucide-react';

interface PublicService {
  monitorId: string;
  name: string;
  state: 'up' | 'degraded' | 'down';
  avgLatencyMs: number;
  uptimePct90d: number;
  lastCheckedAt: string;
  uptimeBars: DayBar[];
}

interface PublicIncident {
  monitorId: string;
  startedAt: string;
  endedAt?: string;
  cause: string;
  status: 'ongoing' | 'resolved';
  durationSeconds?: number;
}

interface PublicStatusResponse {
  tenant: {
    name: string;
    slug: string;
    plan: string;
  };
  systemState: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE';
  overallUptimePct: number;
  lastUpdated: string;
  services: PublicService[];
  recentIncidents: PublicIncident[];
}

export const PublicStatusPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading, error, refetch, isFetching } = useQuery<PublicStatusResponse>({
    queryKey: ['public-status', slug],
    queryFn: async () => {
      const res = await fetch(`/api/v1/public/status/${slug}`);
      if (!res.ok) {
        throw new Error(`Failed to load status for ${slug} (${res.status})`);
      }
      return res.json();
    },
    enabled: Boolean(slug),
    refetchInterval: 60000, // Auto-refresh every 60s
  });

  if (isLoading) {
    return (
      <div className="main-content" style={{ maxWidth: 840, paddingTop: 40 }}>
        <div className="panel font-mono" style={{ textAlign: 'center', padding: 48 }}>
          Fetching public status payload for '{slug}'...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="main-content" style={{ maxWidth: 840, paddingTop: 40 }}>
        <div className="empty-state">
          <XCircle size={24} style={{ color: 'var(--color-down)', marginBottom: 8 }} />
          <h2 className="empty-state-title">Public Status Page Not Found</h2>
          <p className="empty-state-desc">
            No public status record found for organization slug '{slug}'. Verify the URL or check tenant configuration in the console.
          </p>
          <Link to="/" className="btn btn-sm">
            <ArrowLeft size={14} /> Back to StatusDeck
          </Link>
        </div>
      </div>
    );
  }

  const { tenant, systemState, overallUptimePct, lastUpdated, services, recentIncidents } = data;

  // Banner styling
  let bannerBg = 'var(--color-up-subtle)';
  let bannerBorder = '#C4DFC9';
  let bannerColor = 'var(--color-up)';
  let bannerIcon = <CheckCircle2 size={20} />;
  let bannerText = 'All Systems Operational';

  if (systemState === 'DEGRADED') {
    bannerBg = 'var(--color-degraded-subtle)';
    bannerBorder = '#F3DCB3';
    bannerColor = 'var(--color-degraded)';
    bannerIcon = <AlertTriangle size={20} />;
    bannerText = 'Active Performance Degradation Detected';
  } else if (systemState === 'OUTAGE') {
    bannerBg = 'var(--color-down-subtle)';
    bannerBorder = '#F0C4C0';
    bannerColor = 'var(--color-down)';
    bannerIcon = <XCircle size={20} />;
    bannerText = 'Major Service Outage in Progress';
  }

  return (
    <div className="main-content" style={{ maxWidth: 920, paddingTop: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, letterSpacing: '-0.02em' }}>
              {tenant.name}
            </h1>
            <span className="tag font-mono">Public Status</span>
          </div>
          <p style={{ color: 'var(--color-ink-secondary)', fontSize: 13 }}>
            Continuous multi-AZ health verification powered by AWS ap-south-1 infrastructure.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => refetch()}
            className="btn btn-sm"
            disabled={isFetching}
            id="btn-refresh-public-status"
          >
            <RefreshCw size={12} className={isFetching ? 'pip-live' : ''} />
            {isFetching ? 'Checking...' : 'Refresh'}
          </button>
          <span className="font-mono" style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
            Updated: {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Main State Banner */}
      <div
        style={{
          backgroundColor: bannerBg,
          border: `1px solid ${bannerBorder}`,
          borderRadius: 2,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: bannerColor,
          marginBottom: 32,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {bannerIcon}
          <div>
            <div style={{ fontSize: 'var(--text-md)', fontWeight: 700 }}>{bannerText}</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>
              Overall 90-day operational ratio: {overallUptimePct.toFixed(2)}%
            </div>
          </div>
        </div>

        <span className="tag font-mono" style={{ backgroundColor: '#FFFFFF', borderColor: bannerBorder }}>
          SLA Target: 99.90%
        </span>
      </div>

      {/* Services List */}
      <div className="panel" style={{ marginBottom: 36, padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: 'var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="panel-title" style={{ fontSize: 'var(--text-md)' }}>
            Service Components Health
          </h2>
          <span className="font-mono" style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
            {services.length} Monitored Endpoints
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {services.map((svc: PublicService) => (
            <div
              key={svc.monitorId}
              style={{
                padding: '20px',
                borderBottom: '1px solid var(--color-rule-subtle)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong style={{ fontSize: 'var(--text-base)', color: 'var(--color-ink)' }}>
                    {svc.name}
                  </strong>
                  <span className="font-mono" style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginLeft: 8 }}>
                    ({svc.avgLatencyMs} ms avg latency)
                  </span>
                </div>
                <StatusPip status={svc.state} isLive={svc.state === 'up'} />
              </div>

              {/* 90-Day Uptime Bar */}
              <UptimeBar90Days bars={svc.uptimeBars} uptimePct={svc.uptimePct90d} />
            </div>
          ))}
        </div>
      </div>

      {/* Incidents History */}
      <div className="panel" style={{ padding: 0, marginBottom: 48 }}>
        <div style={{ padding: '16px 20px', borderBottom: 'var(--border)' }}>
          <h2 className="panel-title" style={{ fontSize: 'var(--text-md)' }}>
            Past Incidents Log
          </h2>
        </div>

        <div style={{ padding: 20 }}>
          {recentIncidents.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {recentIncidents.map((inc: PublicIncident, i: number) => (
                <div key={i} style={{ borderLeft: '2px solid var(--color-rule)', paddingLeft: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className="tag font-mono">{inc.status === 'ongoing' ? 'Ongoing' : 'Resolved'}</span>
                    <span className="font-mono" style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
                      {new Date(inc.startedAt).toLocaleDateString()} at {new Date(inc.startedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--color-ink)', fontWeight: 500 }}>
                    {inc.cause}
                  </div>
                  {inc.durationSeconds && (
                    <div className="font-mono" style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2 }}>
                      Incident duration: {Math.floor(inc.durationSeconds / 60)} minutes
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--color-ink-secondary)', fontSize: 14 }}>
              No incidents reported for the preceding 90-day observation window.
            </div>
          )}
        </div>
      </div>

      {/* Public Footer */}
      <footer style={{ borderTop: 'var(--border)', paddingTop: 20, textAlign: 'center', fontSize: 12, color: 'var(--color-ink-muted)' }}>
        <div>StatusDeck Operational Telemetry • Deployed in AWS ap-south-1 (Mumbai)</div>
        <div style={{ marginTop: 4 }}>
          <Link to="/" style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>
            Learn more about StatusDeck Cloud Architecture
          </Link>
        </div>
      </footer>
    </div>
  );
};
