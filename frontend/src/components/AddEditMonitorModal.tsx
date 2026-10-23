import React, { useState } from 'react';
import { apiRequest } from '../api/client';
import { X, AlertTriangle, ShieldCheck } from 'lucide-react';

export interface MonitorFormData {
  monitorId?: string;
  name: string;
  url: string;
  method: 'GET' | 'HEAD' | 'POST';
  expectedStatus: number;
  intervalSec: number;
  timeoutMs: number;
  alertEmail: string;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialData?: MonitorFormData | null;
}

export const AddEditMonitorModal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  initialData,
}) => {
  const [formData, setFormData] = useState<MonitorFormData>(() => ({
    name: initialData?.name || '',
    url: initialData?.url || 'https://',
    method: initialData?.method || 'GET',
    expectedStatus: initialData?.expectedStatus || 200,
    intervalSec: initialData?.intervalSec || 60,
    timeoutMs: initialData?.timeoutMs || 5000,
    alertEmail: initialData?.alertEmail || '',
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Real-time client-side SSRF hint
  const isSsrfSuspect =
    formData.url.includes('localhost') ||
    formData.url.includes('127.0.0.1') ||
    formData.url.includes('169.254.169.254') ||
    formData.url.includes('10.') ||
    formData.url.includes('192.168.');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      if (initialData?.monitorId) {
        await apiRequest(`/monitors/${initialData.monitorId}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
      } else {
        await apiRequest('/monitors', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save monitor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(22, 21, 15, 0.45)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="panel"
        style={{
          width: '100%',
          maxWidth: 540,
          backgroundColor: 'var(--color-panel)',
          boxShadow: 'none',
        }}
      >
        <div className="panel-header" style={{ marginBottom: 16 }}>
          <h2 id="modal-title" className="panel-title">
            {initialData?.monitorId ? 'Edit Probe Specification' : 'Add Monitored HTTP Endpoint'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-ink-muted)',
            }}
            aria-label="Close dialog"
            id="btn-close-modal"
          >
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              backgroundColor: 'var(--color-down-subtle)',
              border: '1px solid #F0C4C0',
              padding: '10px 14px',
              borderRadius: 2,
              marginBottom: 16,
              fontSize: 13,
              color: 'var(--color-down)',
            }}
          >
            <strong>Error:</strong> {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="input-name">
              Endpoint Name
              <span className="form-hint">Internal service moniker</span>
            </label>
            <input
              id="input-name"
              type="text"
              required
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Primary Payment Gateway"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="input-url">
              Target URL
              <span className="form-hint">Must be public HTTPS/HTTP</span>
            </label>
            <input
              id="input-url"
              type="url"
              required
              className="form-input"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://api.domain.io/health"
            />
            {isSsrfSuspect && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--color-down)',
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                <AlertTriangle size={14} />
                <span>SSRF Warning: Target URL points to a reserved, loopback, or metadata IP. The backend will block this request.</span>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="select-method">
                HTTP Method
              </label>
              <select
                id="select-method"
                className="form-select"
                value={formData.method}
                onChange={(e) =>
                  setFormData({ ...formData, method: e.target.value as 'GET' | 'HEAD' | 'POST' })
                }
              >
                <option value="GET">GET</option>
                <option value="HEAD">HEAD</option>
                <option value="POST">POST</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="input-expected">
                Expected Status
              </label>
              <input
                id="input-expected"
                type="number"
                min={100}
                max={599}
                className="form-input"
                value={formData.expectedStatus}
                onChange={(e) =>
                  setFormData({ ...formData, expectedStatus: parseInt(e.target.value, 10) })
                }
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="select-interval">
                Check Interval
              </label>
              <select
                id="select-interval"
                className="form-select"
                value={formData.intervalSec}
                onChange={(e) =>
                  setFormData({ ...formData, intervalSec: parseInt(e.target.value, 10) })
                }
              >
                <option value={60}>1 Minute (Standard)</option>
                <option value={300}>5 Minutes (Relaxed)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="input-timeout">
                Timeout (ms)
              </label>
              <input
                id="input-timeout"
                type="number"
                min={1000}
                max={30000}
                step={500}
                className="form-input"
                value={formData.timeoutMs}
                onChange={(e) =>
                  setFormData({ ...formData, timeoutMs: parseInt(e.target.value, 10) })
                }
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="input-email">
              Alert Destination Email
              <span className="form-hint">Receives AWS SNS incident notification</span>
            </label>
            <input
              id="input-email"
              type="email"
              className="form-input"
              value={formData.alertEmail}
              onChange={(e) => setFormData({ ...formData, alertEmail: e.target.value })}
              placeholder="sre-team@acme.internal"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-sm"
              disabled={isSubmitting}
              id="btn-cancel-modal"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              disabled={isSubmitting}
              id="btn-save-monitor"
            >
              <ShieldCheck size={14} />
              {isSubmitting ? 'Verifying & Saving...' : 'Save Probe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
