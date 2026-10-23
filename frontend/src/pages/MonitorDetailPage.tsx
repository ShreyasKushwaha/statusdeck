import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import { StatusPip } from '../components/StatusPip';
import { UptimeBar90Days } from '../components/UptimeBar90Days';
import { LatencyChart } from '../components/LatencyChart';
import { ArrowLeft, Clock, Shield, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { MonitorItem } from './DashboardPage';

interface CheckResultItem {
  monitorId: string;
  timestamp: string;
  statusCode: number;
  latencyMs: number;
  ok: boolean;
}

interface ResultsResponse {
  monitorId: string;
  range: string;
  metrics: {
    uptimePct: number;
    totalChecks: number;
    failedChecks: number;
    avgLatency: number;
    p95Latency: number;
    minLatency: number;
    maxLatency: number;
  };
  results: CheckResultItem[];
}

interface IncidentItem {
  monitorId: string;
  startedAt: string;
  endedAt?: string;
  cause: string;
  status: 'ongoing' | 'resolved';
  durationSeconds?: number;
}

export const MonitorDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h');

  // Fetch monitor metadata
  const { data: monitorData, isLoading: isMonLoading } = useQuery<{ monitor: MonitorItem }>({
    queryKey: ['monitor', id],
    queryFn: () => apiRequest<{ monitor: MonitorItem }>(`/monitors/${id}`),
    enabled: Boolean(id),
  });

  // Fetch check results
  const { data: resultsData, isLoading: isResLoading } = useQuery<ResultsResponse>({
    queryKey: ['monitor-results', id, range],
    queryFn: () => apiRequest<ResultsResponse>(`/monitors/${id}/results?range=${range}`),
    enabled: Boolean(id),
  });

  // Fetch incidents
  const { data: incidentsData } = useQuery<{ incidents: IncidentItem[] }>({
    queryKey: ['incidents'],
    queryFn: () => apiRequest<{ incidents: IncidentItem[] }>('/incidents'),
  });

  const monitor = monitorData?.monitor;
  const metrics = resultsData?.metrics;
  const results = resultsData?.results || [];
  const incidents = (incidentsData?.incidents || []).filter((inc: IncidentItem) => inc.monitorId === id);

  if (isMonLoading) {
    return (
      <div className="main-content">
        <div className="panel font-mono" style={{ padding: 32, textAlign: 'center' }}>
          Loading probe specifications for {id}...
        </div>
      </div>
    );
  }

  if (!monitor) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <h2 className="empty-state-title">Monitor Probe Not Found</h2>
          <p className="empty-state-desc">
            The requested probe '{id}' does not exist or does not belong to your active tenant.
          </p>
          <Link to="/dashboard" className="btn btn-sm">
            <ArrowLeft size={14} /> Back to Console
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      {/* Back button and breadcrumb */}
      <div style={{ marginBottom: 16 }}>
        <Link
          to="/dashboard"
          className="btn btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          id="btn-back-dashboard"
        >
          <ArrowLeft size={14} /> Back to Telemetry Console
        </Link>
      </div>

      {/* Header Panel */}
      <div className="panel" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <StatusPip status={monitor.state} isLive={monitor.state === 'up'} />
              <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, letterSpacing: '-0.02em' }}>
                {monitor.name}
              </h1>
              <span className="tag font-mono">{monitor.monitorId}</span>
            </div>
            <div className="font-mono" style={{ color: 'var(--color-ink-secondary)', fontSize: 13, marginBottom: 8 }}>
              {monitor.method} {monitor.url}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--color-ink-muted)' }}>
              <span>Expected: HTTP {monitor.expectedStatus}</span>
              <span>•</span>
              <span>Cadence: Every {monitor.intervalSec}s</span>
              <span>•</span>
              <span>Timeout: {monitor.timeoutMs}ms</span>
              {monitor.alertEmail && (
                <>
                  <span>•</span>
                  <span>SNS Alert: {monitor.alertEmail}</span>
                </>
              )}
            </div>
          </div>

          {/* Time range selector */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['24h', '7d', '30d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`btn btn-sm ${range === r ? 'btn-primary' : ''}`}
                style={{ padding: '4px 12px', fontSize: 12 }}
                id={`btn-range-${r}`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: 'var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 8 }}>
            90-Day Rolling Availability Log
          </div>
          <UptimeBar90Days uptimePct={monitor.uptimePct90d || 100} />
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">{range.toUpperCase()} Availability</span>
          <span className="kpi-value" style={{ color: (metrics?.uptimePct || 100) >= 99.9 ? 'var(--color-up)' : 'var(--color-degraded)' }}>
            {metrics?.uptimePct?.toFixed(2) || '100.00'}%
          </span>
          <span className="kpi-sub font-mono">
            {metrics?.failedChecks || 0} failed / {metrics?.totalChecks || 0} total checks
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">P95 Latency</span>
          <span className="kpi-value font-mono">{metrics?.p95Latency || 0} ms</span>
          <span className="kpi-sub font-mono">95th percentile latency cutoff</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Average Latency</span>
          <span className="kpi-value font-mono">{metrics?.avgLatency || 0} ms</span>
          <span className="kpi-sub font-mono">Arithmetic mean across {range}</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Latency Extremes</span>
          <span className="kpi-value font-mono" style={{ fontSize: 'var(--text-lg)' }}>
            {metrics?.minLatency || 0}ms / {metrics?.maxLatency || 0}ms
          </span>
          <span className="kpi-sub font-mono">Min / Max observed response</span>
        </div>
      </div>

      {/* Latency History Chart */}
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-header">
          <h2 className="panel-title">
            <Clock size={16} />
            Response Time Distribution ({range.toUpperCase()})
          </h2>
          <span className="tag font-mono">Instrumented via Recharts</span>
        </div>

        {isResLoading ? (
          <div className="font-mono" style={{ padding: 48, textAlign: 'center' }}>
            Aggregating latency samples from DynamoDB CheckResults...
          </div>
        ) : (
          <LatencyChart data={results} />
        )}
      </div>

      {/* Incident History Table */}
      <div className="panel" style={{ marginBottom: 24, padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: 'var(--border)' }}>
          <h2 className="panel-title">
            <AlertTriangle size={16} />
            Incident Log & Root Cause History
          </h2>
        </div>

        <div className="table-wrapper" style={{ border: 'none' }}>
          <table className="ops-table">
            <thead>
              <tr>
                <th style={{ width: '12%' }}>Status</th>
                <th style={{ width: '22%' }}>Incident Inception</th>
                <th style={{ width: '22%' }}>Resolution Time</th>
                <th style={{ width: '14%' }}>Duration</th>
                <th style={{ width: '30%' }}>Observed Failure Signature</th>
              </tr>
            </thead>
            <tbody>
              {incidents.length > 0 ? (
                incidents.map((inc: IncidentItem, i: number) => (
                  <tr key={i}>
                    <td>
                      <span className={`tag ${inc.status === 'ongoing' ? 'tag-iaas' : ''}`}>
                        {inc.status === 'ongoing' ? 'Active Incident' : 'Resolved'}
                      </span>
                    </td>
                    <td className="font-mono" style={{ fontSize: 12 }}>
                      {new Date(inc.startedAt).toLocaleString()}
                    </td>
                    <td className="font-mono" style={{ fontSize: 12 }}>
                      {inc.endedAt ? new Date(inc.endedAt).toLocaleString() : 'Ongoing'}
                    </td>
                    <td className="font-mono" style={{ fontSize: 12 }}>
                      {inc.durationSeconds ? `${Math.floor(inc.durationSeconds / 60)} min` : 'In progress'}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--color-ink-secondary)' }}>
                      {inc.cause}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--color-ink-muted)' }}>
                    <CheckCircle2 size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: -2, color: 'var(--color-up)' }} />
                    Zero incidents recorded in the preceding 90-day monitoring window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Checks Table */}
      <div className="panel" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: 'var(--border)' }}>
          <h2 className="panel-title">
            <Shield size={16} />
            Recent Telemetry Probes (CheckResults Table with 30-Day TTL)
          </h2>
        </div>

        <div className="table-wrapper" style={{ border: 'none' }}>
          <table className="ops-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>Timestamp (ISO)</th>
                <th style={{ width: '15%' }}>HTTP Status</th>
                <th style={{ width: '20%' }}>Round-Trip Latency</th>
                <th style={{ width: '20%' }}>Execution Outcome</th>
                <th style={{ width: '20%' }}>TTL Expiry State</th>
              </tr>
            </thead>
            <tbody>
              {results.slice(-15).reverse().map((r: CheckResultItem, i: number) => (
                <tr key={i}>
                  <td className="font-mono" style={{ fontSize: 12 }}>
                    {r.timestamp}
                  </td>
                  <td className="font-mono">
                    <span style={{ color: r.statusCode === 200 ? 'var(--color-up)' : 'var(--color-down)', fontWeight: 600 }}>
                      HTTP {r.statusCode}
                    </span>
                  </td>
                  <td className="font-mono">{r.latencyMs} ms</td>
                  <td>
                    <span className="tag" style={{ color: r.ok ? 'var(--color-up)' : 'var(--color-down)' }}>
                      {r.ok ? 'SUCCESS' : 'FAILED'}
                    </span>
                  </td>
                  <td className="font-mono" style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>
                    Active (30-day DynamoDB TTL)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
