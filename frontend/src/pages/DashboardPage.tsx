import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiRequest, getCurrentTenantId } from '../api/client';
import { StatusPip } from '../components/StatusPip';
import { UptimeBar90Days } from '../components/UptimeBar90Days';
import { AddEditMonitorModal, MonitorFormData } from '../components/AddEditMonitorModal';
import { Plus, RefreshCw, ExternalLink, Trash2, Edit2, ChevronRight, Activity, AlertCircle } from 'lucide-react';

export interface MonitorItem {
  tenantId: string;
  monitorId: string;
  name: string;
  url: string;
  method: 'GET' | 'HEAD' | 'POST';
  expectedStatus: number;
  intervalSec: number;
  timeoutMs: number;
  state: 'up' | 'degraded' | 'down';
  alertEmail?: string;
  lastCheckedAt?: string;
  avgLatencyMs?: number;
  uptimePct90d?: number;
  consecutiveFailures?: number;
}

export const DashboardPage: React.FC = () => {
  const queryClient = useQueryClient();
  const currentTenant = getCurrentTenantId();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState<MonitorFormData | null>(null);

  // Fetch monitors
  const { data, isLoading, error, refetch, isFetching } = useQuery<{ monitors: MonitorItem[] }>({
    queryKey: ['monitors', currentTenant],
    queryFn: () => apiRequest<{ monitors: MonitorItem[] }>('/monitors'),
  });

  const monitors: MonitorItem[] = data?.monitors || [];

  // Compute summary metrics
  const totalMonitors = monitors.length;
  const operationalCount = monitors.filter((m: MonitorItem) => m.state === 'up').length;
  const degradedCount = monitors.filter((m: MonitorItem) => m.state === 'degraded').length;
  const downCount = monitors.filter((m: MonitorItem) => m.state === 'down').length;

  const fleetUptime =
    totalMonitors > 0
      ? Number(
          (
            monitors.reduce((acc: number, m: MonitorItem) => acc + (m.uptimePct90d || 100), 0) /
            totalMonitors
          ).toFixed(2)
        )
      : 100.0;

  const avgLatency =
    totalMonitors > 0
      ? Math.round(
          monitors.reduce((acc: number, m: MonitorItem) => acc + (m.avgLatencyMs || 0), 0) / totalMonitors
        )
      : 0;

  const handleDelete = async (monitorId: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete probe '${name}'?`)) {
      try {
        await apiRequest(`/monitors/${monitorId}`, { method: 'DELETE' });
        queryClient.invalidateQueries({ queryKey: ['monitors'] });
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to delete monitor');
      }
    }
  };

  const handleEdit = (m: MonitorItem) => {
    setEditingMonitor({
      monitorId: m.monitorId,
      name: m.name,
      url: m.url,
      method: m.method,
      expectedStatus: m.expectedStatus,
      intervalSec: m.intervalSec,
      timeoutMs: m.timeoutMs,
      alertEmail: m.alertEmail || '',
    });
    setIsModalOpen(true);
  };

  const handleOpenAdd = () => {
    setEditingMonitor(null);
    setIsModalOpen(true);
  };

  return (
    <div className="main-content">
      {/* Console Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Operations Telemetry Console
            </h1>
            <span className="tag font-mono">Tenant: {currentTenant}</span>
          </div>
          <p style={{ color: 'var(--color-ink-secondary)', fontSize: 'var(--text-base)' }}>
            Real-time HTTP health, latency jitter, and 90-day availability verified by AWS Lambda workers.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => refetch()}
            className="btn btn-sm"
            title="Refresh probe fleet telemetry"
            disabled={isFetching}
            id="btn-refresh-monitors"
          >
            <RefreshCw size={14} className={isFetching ? 'pip-live' : ''} />
            {isFetching ? 'Polling...' : 'Refresh'}
          </button>

          <Link
            to={`/status/${currentTenant === 'demo-tenant-1' ? 'acme-corp' : currentTenant}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm"
            id="btn-view-public-page"
          >
            <ExternalLink size={14} />
            Public Page
          </Link>

          <button
            onClick={handleOpenAdd}
            className="btn btn-sm btn-primary"
            id="btn-add-monitor"
          >
            <Plus size={14} />
            Add Endpoint Probe
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Active Probes</span>
          <span className="kpi-value">{totalMonitors}</span>
          <span className="kpi-sub font-mono">
            {operationalCount} Up • {degradedCount} Degraded • {downCount} Down
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Fleet Availability</span>
          <span className="kpi-value" style={{ color: fleetUptime >= 99.9 ? 'var(--color-up)' : 'var(--color-degraded)' }}>
            {fleetUptime.toFixed(2)}%
          </span>
          <span className="kpi-sub font-mono">Target SLA: 99.90%</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Avg Fleet Latency</span>
          <span className="kpi-value font-mono">{avgLatency} ms</span>
          <span className="kpi-sub font-mono">Checked via EventBridge FaaS</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Active Incidents</span>
          <span className="kpi-value font-mono" style={{ color: downCount > 0 ? 'var(--color-down)' : 'var(--color-ink)' }}>
            {downCount + degradedCount}
          </span>
          <span className="kpi-sub font-mono">Debounce rule: 2 consecutive fails</span>
        </div>
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <div className="panel font-mono" style={{ padding: 32, textAlign: 'center' }}>
          Querying DynamoDB partition for tenant {currentTenant}...
        </div>
      )}

      {error && (
        <div className="panel" style={{ backgroundColor: 'var(--color-down-subtle)', border: '1px solid #F0C4C0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-down)' }}>
            <AlertCircle size={18} />
            <strong>Failed to load monitors:</strong>
            <span>{error instanceof Error ? error.message : 'Unknown error'}</span>
          </div>
        </div>
      )}

      {/* Monitors Table */}
      {!isLoading && !error && monitors.length > 0 && (
        <div className="table-wrapper">
          <table className="ops-table">
            <thead>
              <tr>
                <th style={{ width: '12%' }}>State</th>
                <th style={{ width: '28%' }}>Monitored Service</th>
                <th style={{ width: '30%' }}>90-Day Availability History</th>
                <th style={{ width: '10%' }}>Avg Latency</th>
                <th style={{ width: '10%' }}>Last Polled</th>
                <th style={{ width: '10%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {monitors.map((m: MonitorItem) => (
                <tr key={m.monitorId}>
                  <td data-label="State">
                    <StatusPip status={m.state} isLive={m.state === 'up'} />
                  </td>
                  <td data-label="Service">
                    <Link
                      to={`/monitors/${m.monitorId}`}
                      style={{ color: 'var(--color-ink)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      id={`link-monitor-${m.monitorId}`}
                    >
                      {m.name}
                      <ChevronRight size={14} color="var(--color-ink-muted)" />
                    </Link>
                    <div className="font-mono" style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 2 }}>
                      {m.method} {m.url}
                    </div>
                  </td>
                  <td data-label="90-Day History">
                    <UptimeBar90Days uptimePct={m.uptimePct90d || 100} />
                  </td>
                  <td data-label="Latency" className="font-mono">
                    <span style={{ color: (m.avgLatencyMs || 0) > 200 ? 'var(--color-degraded)' : 'inherit' }}>
                      {m.avgLatencyMs || 0} ms
                    </span>
                  </td>
                  <td data-label="Last Polled" className="font-mono" style={{ fontSize: 12, color: 'var(--color-ink-secondary)' }}>
                    {m.lastCheckedAt ? new Date(m.lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never'}
                  </td>
                  <td data-label="Actions" style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        onClick={() => handleEdit(m)}
                        className="btn btn-sm"
                        title="Edit Probe"
                        id={`btn-edit-${m.monitorId}`}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(m.monitorId, m.name)}
                        className="btn btn-sm btn-danger"
                        title="Delete Probe"
                        id={`btn-delete-${m.monitorId}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty State with technical instructions */}
      {!isLoading && !error && monitors.length === 0 && (
        <div className="empty-state">
          <Activity size={24} style={{ color: 'var(--color-accent)', marginBottom: 8 }} />
          <h2 className="empty-state-title">No Endpoint Probes Configured for Tenant '{currentTenant}'</h2>
          <p className="empty-state-desc">
            StatusDeck probes perform periodic HTTP GET/POST checks scheduled via AWS EventBridge and executed by AWS Lambda in ap-south-1. Configure your first public health check URL to begin recording latency percentiles and publishing status bars.
          </p>
          <button onClick={handleOpenAdd} className="btn btn-primary" id="btn-empty-add-monitor">
            <Plus size={14} />
            Provision First Probe
          </button>
        </div>
      )}

      {/* Add / Edit Modal */}
      <AddEditMonitorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['monitors'] })}
        initialData={editingMonitor}
      />
    </div>
  );
};
