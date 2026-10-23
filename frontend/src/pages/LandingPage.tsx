import React from 'react';
import { Link } from 'react-router-dom';
import { StatusPip } from '../components/StatusPip';
import { UptimeBar90Days } from '../components/UptimeBar90Days';
import { ArrowRight, Check, ShieldCheck, Terminal, Server, Layers } from 'lucide-react';

export const LandingPage: React.FC = () => {
  return (
    <div className="main-content">
      {/* Dense Operational Hero Header */}
      <section style={{ marginBottom: 48, borderBottom: 'var(--border)', paddingBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span className="tag font-mono">FT-III Cloud Computing Case Study</span>
          <span className="tag tag-iaas font-mono">AWS Mumbai (ap-south-1)</span>
          <span className="tag tag-paas font-mono">Multi-AZ 99.9% SLA</span>
        </div>

        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 16 }}>
          Deterministic uptime monitoring for lean engineering teams.
        </h1>

        <p style={{ fontSize: 'var(--text-lg)', color: 'var(--color-ink-secondary)', maxWidth: 760, marginBottom: 24, lineHeight: 1.45 }}>
          StatusDeck continuously verifies HTTP service reachability from multi-AZ AWS infrastructure, isolates tenants at the database partition boundary, emits debounced incident alerts, and hosts verifiable public status logs.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/dashboard" className="btn btn-primary" id="landing-cta-console">
            Open Operations Console
            <ArrowRight size={16} />
          </Link>
          <Link to="/architecture" className="btn" id="landing-cta-architecture">
            <Server size={16} />
            Inspect AWS Architecture
          </Link>
          <Link to="/evaluation" className="btn" id="landing-cta-evaluation">
            <Layers size={16} />
            View Load Tests & TCO
          </Link>
        </div>
      </section>

      {/* Live Operational Status Strip Demo */}
      <section style={{ marginBottom: 48 }}>
        <div className="panel-header" style={{ marginBottom: 12 }}>
          <h2 className="panel-title" style={{ fontSize: 'var(--text-md)' }}>
            <Terminal size={16} />
            Live Global Probe Fleet Telemetry
          </h2>
          <span className="tag font-mono">Active Pollers: EventBridge + Lambda</span>
        </div>

        <div className="panel" style={{ padding: 0 }}>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="ops-table">
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Endpoint Moniker</th>
                  <th style={{ width: '15%' }}>State</th>
                  <th style={{ width: '35%' }}>90-Day Operational Ratio</th>
                  <th style={{ width: '12%' }}>Avg Latency</th>
                  <th style={{ width: '13%' }}>Interval</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Primary Edge Gateway</strong>
                    <div className="font-mono" style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>
                      https://api.statusdeck.internal/health
                    </div>
                  </td>
                  <td>
                    <StatusPip status="up" isLive={true} />
                  </td>
                  <td>
                    <UptimeBar90Days uptimePct={99.96} />
                  </td>
                  <td className="font-mono">42 ms</td>
                  <td className="font-mono">60s (ap-south-1a)</td>
                </tr>
                <tr>
                  <td>
                    <strong>Identity Token Signer (Cognito)</strong>
                    <div className="font-mono" style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>
                      https://auth.statusdeck.internal/oauth2/token
                    </div>
                  </td>
                  <td>
                    <StatusPip status="up" isLive={true} />
                  </td>
                  <td>
                    <UptimeBar90Days uptimePct={99.88} />
                  </td>
                  <td className="font-mono">118 ms</td>
                  <td className="font-mono">300s (ap-south-1b)</td>
                </tr>
                <tr>
                  <td>
                    <strong>Checkout Settlement Webhook</strong>
                    <div className="font-mono" style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>
                      https://payments.statusdeck.internal/webhooks
                    </div>
                  </td>
                  <td>
                    <StatusPip status="degraded" />
                  </td>
                  <td>
                    <UptimeBar90Days uptimePct={98.65} />
                  </td>
                  <td className="font-mono" style={{ color: 'var(--color-degraded)' }}>345 ms</td>
                  <td className="font-mono">60s (Multi-AZ)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Cloud Computing Syllabus Mapping & Technical Pillars */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 20 }}>
          Syllabus Mapping: Cloud Computing FT-III Framework
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div className="panel">
            <span className="tag tag-iaas font-mono" style={{ marginBottom: 8 }}>Unit 1 • SLA & TCO</span>
            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 6 }}>Service Level Agreements</h3>
            <p style={{ color: 'var(--color-ink-secondary)', fontSize: 'var(--text-base)', lineHeight: 1.4 }}>
              Rigorous 99.9% uptime target allows maximum 43.8 minutes downtime/month. Includes CapEx vs OpEx analysis showing $33.10/mo AWS cloud cost versus $300/mo on-premises infrastructure.
            </p>
          </div>

          <div className="panel">
            <span className="tag tag-paas font-mono" style={{ marginBottom: 8 }}>Unit 2 • Service Models</span>
            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 6 }}>IaaS, PaaS & SaaS Layering</h3>
            <p style={{ color: 'var(--color-ink-secondary)', fontSize: 'var(--text-base)', lineHeight: 1.4 }}>
              Demonstrates EC2 ASG compute (IaaS), serverless Lambda scheduled workers & DynamoDB (PaaS/FaaS), and delivers StatusDeck as a multi-tenant uptime monitoring product (SaaS).
            </p>
          </div>

          <div className="panel">
            <span className="tag tag-saas font-mono" style={{ marginBottom: 8 }}>Unit 3 • Cloud Security</span>
            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 6 }}>Zero Trust & Least Privilege</h3>
            <p style={{ color: 'var(--color-ink-secondary)', fontSize: 'var(--text-base)', lineHeight: 1.4 }}>
              Strict Cognito JWT verification, tenant isolation on every DynamoDB partition key, security groups restricting EC2 traffic solely to ALB, and active SSRF filtering blocking IMDS (169.254.169.254).
            </p>
          </div>

          <div className="panel">
            <span className="tag tag-iaas font-mono" style={{ marginBottom: 8 }}>Unit 4 • Elastic Scalability</span>
            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 6 }}>Auto Scaling & Capacity</h3>
            <p style={{ color: 'var(--color-ink-secondary)', fontSize: 'var(--text-base)', lineHeight: 1.4 }}>
              Application Load Balancer health checks trigger Auto Scaling Groups (1 to 4 instances) at 50% CPU threshold, verified under load testing with 10, 50, and 200 concurrent connections.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing & Plan Matrix */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 8 }}>
          Transparent Multi-Tenant Provisioning
        </h2>
        <p style={{ color: 'var(--color-ink-secondary)', marginBottom: 24 }}>
          Predictable resource consumption designed to remain within AWS Free Tier quotas.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          <div className="panel" style={{ border: 'var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>Developer Tier</h3>
              <span className="font-mono" style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>$0 / mo</span>
            </div>
            <p style={{ color: 'var(--color-ink-secondary)', fontSize: 'var(--text-base)', marginBottom: 20 }}>
              For personal projects and standalone cloud prototypes.
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, fontSize: 'var(--text-base)' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--color-up)" /> Up to 5 monitored HTTP endpoints
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--color-up)" /> 5-minute polling interval
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--color-up)" /> 30-day DynamoDB TTL data retention
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--color-up)" /> Hosted public status slug (/status/:slug)
              </li>
            </ul>
            <Link to="/auth" className="btn" style={{ width: '100%' }}>
              Get Started Free
            </Link>
          </div>

          <div className="panel" style={{ border: '2px solid var(--color-ink)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>Engineering Team</h3>
                <span className="tag font-mono" style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)' }}>
                  Recommended
                </span>
              </div>
              <span className="font-mono" style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>$29 / mo</span>
            </div>
            <p style={{ color: 'var(--color-ink-secondary)', fontSize: 'var(--text-base)', marginBottom: 20 }}>
              For high-availability production workloads and microservices.
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, fontSize: 'var(--text-base)' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--color-up)" /> Up to 100 monitored endpoints
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--color-up)" /> 60-second high-frequency polling
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--color-up)" /> Debounced SNS incident alerts (email/SMS)
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--color-up)" /> Multi-AZ failover telemetry & latency percentiles
              </li>
            </ul>
            <Link to="/auth" className="btn btn-primary" style={{ width: '100%' }}>
              <ShieldCheck size={16} />
              Deploy Team Console
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
