import React, { useState } from 'react';
import { CheckCircle2, Cpu } from 'lucide-react';

interface ServiceDetail {
  id: string;
  name: string;
  model: 'IaaS' | 'PaaS' | 'SaaS';
  category: string;
  unit: string;
  role: string;
  freeTierNote: string;
  techDetails: string[];
}

const servicesData: ServiceDetail[] = [
  {
    id: 'alb',
    name: 'Application Load Balancer (ALB)',
    model: 'IaaS',
    category: 'Networking & Traffic Distribution',
    unit: 'Unit 4: Load Balancing & Virtualization',
    role: 'Public Internet-facing gateway spanning 2 Availability Zones (ap-south-1a, ap-south-1b). Terminates TLS, conducts continuous HTTP health probes to /health, and distributes API traffic evenly across active EC2 backend instances.',
    freeTierNote: '750 hours/month free for 12 months (Shared Load Balancer Capacity Units).',
    techDetails: [
      'Multi-AZ target group distribution',
      'Path-based routing (/api/v1/* to Express backend)',
      'Sub-second failover on unhealthy host detection',
      'Enforces HTTPS TLS 1.3 encryption in transit',
    ],
  },
  {
    id: 'asg',
    name: 'Auto Scaling Group & EC2 (t3.micro)',
    model: 'IaaS',
    category: 'Virtual Compute & Elastic Scaling',
    unit: 'Unit 4: Virtualization, EC2 AMI & ASG',
    role: 'Elastic cluster of t3.micro virtual instances running containerized Node.js/Express API inside private subnets. Auto Scaling policy dynamically tracks 50% CPU utilization (Min: 1, Desired: 2, Max: 4).',
    freeTierNote: '750 hours/month of t3.micro/t2.micro instances included in Free Tier.',
    techDetails: [
      'Nitro Hypervisor lightweight virtualization',
      'Launch Template with Docker automated user-data provisioning',
      'Target tracking scaling policy at 50% average CPU',
      'Cooldown period: 300s to avoid flapping oscillations',
    ],
  },
  {
    id: 'lambda',
    name: 'AWS Lambda (Monitor Worker Fleet)',
    model: 'PaaS',
    category: 'Serverless Event-Driven Compute',
    unit: 'Unit 2: PaaS/FaaS & Unit 5: Web Services Case Study',
    role: 'FaaS execution engine triggered every 1 to 5 minutes by EventBridge schedules. Dispatches outbound HTTP probes to tenant URLs, measures DNS/TCP/TTFB latency, updates DynamoDB, and dispatches incident alerts to SNS upon failures.',
    freeTierNote: '1,000,000 requests/month and 3.2M seconds of compute time free forever.',
    techDetails: [
      'Sub-100ms cold starts with Node.js runtime',
      'Zero idle cost (scales down to absolute zero)',
      'Built-in retry and dead-letter queue semantics',
      'Direct VPC egress via VPC endpoints',
    ],
  },
  {
    id: 'dynamodb',
    name: 'Amazon DynamoDB',
    model: 'PaaS',
    category: 'Managed NoSQL Database',
    unit: 'Unit 2: PaaS & Unit 3: Cloud Security (Tenant Isolation)',
    role: 'Ultra-low latency key-value store holding Tenants, Monitors, CheckResults, and Incidents. Provides cryptographic tenant isolation by enforcing tenantId partition keys on all queries, with 30-day Time-To-Live (TTL) for check result retention.',
    freeTierNote: '25 GB storage and 25 RCU / 25 WCU free forever under AWS Free Tier.',
    techDetails: [
      'Automatic single-digit millisecond latency at scale',
      'Automatic multi-AZ synchronous replication',
      '30-day native TTL on CheckResults (zero-cost auto-purge)',
      'Server-side encryption at rest (KMS managed)',
    ],
  },
  {
    id: 'cognito',
    name: 'Amazon Cognito User Pools',
    model: 'PaaS',
    category: 'Identity & Access Management',
    unit: 'Unit 3: Cloud Security & Identity Federation',
    role: 'Enterprise identity directory providing user registration, email verification codes, password policies, and issuing cryptographically signed RS256 JWT tokens with custom tenantId claims.',
    freeTierNote: '50,000 Monthly Active Users (MAUs) free forever.',
    techDetails: [
      'Self-service user registration and email MFA verification',
      'RS256 asymmetric public-key signature verification',
      'Tenant partition ID embedded into JWT token claims',
      'Protection against credential stuffing & brute force',
    ],
  },
  {
    id: 'sns',
    name: 'Amazon Simple Notification Service (SNS)',
    model: 'PaaS',
    category: 'Decoupled Cloud Messaging',
    unit: 'Unit 2: Communication Protocols & Event Decoupling',
    role: 'Pub/Sub notification topic receiving outage signals from the Lambda checker. Implements a 2-consecutive-failure debounce policy before pushing instant email alerts to subscribers, and broadcasts recovery notifications when back up.',
    freeTierNote: '1,000,000 mobile push notifications and 1,000 email deliveries/month free.',
    techDetails: [
      'Pub/Sub fan-out architecture to email and webhooks',
      'High-throughput message queueing with zero message loss',
      'Debounced state machine prevents intermittent alert spam',
    ],
  },
  {
    id: 'cloudfront_s3',
    name: 'CloudFront & S3 (Static Frontend CDN)',
    model: 'PaaS',
    category: 'Global Content Delivery & Object Storage',
    unit: 'Unit 3: S3 Bucket Security & Unit 5: Multi-AZ Design',
    role: 'Private S3 bucket housing the Vite/React SPA, served exclusively through AWS CloudFront CDN via Origin Access Control (OAC). S3 public access is completely blocked.',
    freeTierNote: '1 TB of CloudFront data transfer out and 5 GB of S3 storage free for 12 months.',
    techDetails: [
      'Origin Access Control (OAC) prevents direct S3 access',
      'Global edge caching for sub-20ms asset delivery',
      'Automated HTTPS TLS 1.3 termination at edge locations',
      'S3 Block Public Access enabled at account level',
    ],
  },
  {
    id: 'statusdeck',
    name: 'StatusDeck (The Monitoring Platform)',
    model: 'SaaS',
    category: 'Finished End-User Software Application',
    unit: 'Unit 2: Software as a Service (SaaS)',
    role: 'The fully realized multi-tenant monitoring product itself. Abstracting underlying infrastructure from users who simply sign up, configure probe endpoints, and receive alerts.',
    freeTierNote: 'Demonstrates end-to-end SaaS unit economics and multi-tenancy.',
    techDetails: [
      'Multi-tenant logical isolation across API, DB, and UI',
      'Self-hosted public status pages per tenant (/status/:slug)',
      'Sub-second telemetry dashboards and latency distributions',
    ],
  },
];

export const ArchitecturePage: React.FC = () => {
  const [selectedService, setSelectedService] = useState<ServiceDetail>(servicesData[0]);
  const [activeUnitTab, setActiveUnitTab] = useState<'all' | 'unit1' | 'unit2' | 'unit3' | 'unit4' | 'unit5'>('all');

  return (
    <div className="main-content">
      {/* Page Title & Context */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="tag font-mono">FT-III Architecture Specification</span>
          <span className="tag tag-iaas font-mono">AWS ap-south-1 Multi-AZ</span>
        </div>
        <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>
          AWS System Architecture & Syllabus Mapping
        </h1>
        <p style={{ color: 'var(--color-ink-secondary)', fontSize: 'var(--text-base)', maxWidth: 840, lineHeight: 1.45 }}>
          StatusDeck combines IaaS (VPC, ALB, EC2 Auto Scaling), PaaS/FaaS (DynamoDB, Lambda, Cognito, SNS), and SaaS (multi-tenant monitoring product). This design satisfies all Five Units of the Cloud Computing syllabus.
        </p>
      </div>

      {/* Interactive Architecture Flow Diagram */}
      <div className="panel" style={{ marginBottom: 32 }}>
        <div className="panel-header">
          <h2 className="panel-title">
            <Cpu size={16} />
            Interactive End-to-End AWS Topology
          </h2>
          <span className="tag font-mono">Click any component to inspect specifications</span>
        </div>

        {/* Visual Architectural Map */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 10,
            padding: '16px 0',
          }}
        >
          {servicesData.map((svc) => {
            const isSelected = selectedService.id === svc.id;
            const modelTagClass =
              svc.model === 'IaaS' ? 'tag-iaas' : svc.model === 'PaaS' ? 'tag-paas' : 'tag-saas';

            return (
              <button
                key={svc.id}
                onClick={() => setSelectedService(svc)}
                style={{
                  padding: 12,
                  textAlign: 'left',
                  backgroundColor: isSelected ? 'var(--color-panel-hover)' : 'var(--color-panel)',
                  border: isSelected ? '2px solid var(--color-accent)' : 'var(--border)',
                  borderRadius: 2,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  transition: 'all 120ms ease-out',
                }}
                id={`btn-arch-svc-${svc.id}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`tag font-mono ${modelTagClass}`} style={{ fontSize: 10 }}>
                    {svc.model}
                  </span>
                  {isSelected && <span className="pip pip-up pip-live" />}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>
                  {svc.name.split('(')[0].trim()}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>
                  {svc.category.split('&')[0].trim()}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Component Inspector Card */}
        <div
          style={{
            marginTop: 20,
            padding: 20,
            backgroundColor: '#F7F4EC',
            border: 'var(--border)',
            borderRadius: 2,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>
                {selectedService.name}
              </h3>
              <span className={`tag font-mono ${selectedService.model === 'IaaS' ? 'tag-iaas' : selectedService.model === 'PaaS' ? 'tag-paas' : 'tag-saas'}`}>
                {selectedService.model} Service Model
              </span>
            </div>
            <span className="tag font-mono" style={{ backgroundColor: 'var(--color-panel)' }}>
              {selectedService.unit}
            </span>
          </div>

          <p style={{ color: 'var(--color-ink)', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
            {selectedService.role}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 6 }}>
                Architectural Implementations:
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                {selectedService.techDetails.map((td, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={13} color="var(--color-up)" />
                    <span>{td}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 6 }}>
                AWS Free Tier & Cost Policy:
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-ink-secondary)', backgroundColor: 'var(--color-panel)', padding: '10px 14px', border: 'var(--border)', borderRadius: 2 }}>
                {selectedService.freeTierNote}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Syllabus Units Breakdown */}
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 16 }}>
          Detailed Syllabus Alignment (Units 1 - 5)
        </h2>

        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {(
            [
              ['all', 'All Units Overview'],
              ['unit1', 'Unit 1: SLA & TCO'],
              ['unit2', 'Unit 2: Service Models'],
              ['unit3', 'Unit 3: Cloud Security'],
              ['unit4', 'Unit 4: Virtualization & Scaling'],
              ['unit5', 'Unit 5: Web Services & Multi-AZ'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setActiveUnitTab(val)}
              className={`btn btn-sm ${activeUnitTab === val ? 'btn-primary' : ''}`}
              style={{ fontSize: 12 }}
              id={`tab-unit-${val}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Unit Matrix Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {(activeUnitTab === 'all' || activeUnitTab === 'unit1') && (
            <div className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 700 }}>
                  Unit 1: Cloud Principles, SLA, TCO & Economic Value
                </h3>
                <span className="tag font-mono">Academic Syllabus Pillar</span>
              </div>
              <p style={{ color: 'var(--color-ink-secondary)', fontSize: 14, marginBottom: 12 }}>
                <strong>99.9% Availability SLA:</strong> Target SLA translates mathematically to a maximum permissible downtime of <strong>43.8 minutes per month</strong> (or 8.76 hours per year). StatusDeck measures this continuously via 90-day daily uptime ticks.
              </p>
              <div style={{ fontSize: 13, color: 'var(--color-ink-secondary)', lineHeight: 1.5 }}>
                <strong>TCO & CapEx vs OpEx:</strong> Evaluates transitioning from an on-premise monitoring server ($300/month TCO including amortized 1U hardware CapEx, colocation power, static IP, and hardware maintenance) to AWS cloud OpEx ($33.10/month on t3.micro ASG + ALB + Free Tier DynamoDB & Lambda).
              </div>
            </div>
          )}

          {(activeUnitTab === 'all' || activeUnitTab === 'unit2') && (
            <div className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 700 }}>
                  Unit 2: Cloud Computing Service Models (IaaS, PaaS, SaaS)
                </h3>
                <span className="tag font-mono">Academic Syllabus Pillar</span>
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
                <li>
                  <strong className="tag tag-iaas font-mono" style={{ marginRight: 8 }}>IaaS</strong>
                  Amazon EC2 virtual machine instances running inside a custom VPC with Security Groups, managed via Auto Scaling Groups behind an Application Load Balancer.
                </li>
                <li>
                  <strong className="tag tag-paas font-mono" style={{ marginRight: 8 }}>PaaS</strong>
                  AWS Lambda (serverless monitoring workers invoked by EventBridge), Amazon DynamoDB (managed serverless NoSQL datastore), and Amazon Cognito (managed identity directory).
                </li>
                <li>
                  <strong className="tag tag-saas font-mono" style={{ marginRight: 8 }}>SaaS</strong>
                  StatusDeck itself—delivering finished multi-tenant uptime monitoring and incident publishing software to businesses without requiring infrastructure administration.
                </li>
              </ul>
            </div>
          )}

          {(activeUnitTab === 'all' || activeUnitTab === 'unit3') && (
            <div className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 700 }}>
                  Unit 3: Cloud Security, Identity & Defense-in-Depth
                </h3>
                <span className="tag font-mono">Academic Syllabus Pillar</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, fontSize: 13 }}>
                <div style={{ backgroundColor: 'var(--color-panel-hover)', padding: 12, border: 'var(--border)' }}>
                  <strong>IAM Least Privilege:</strong> EC2 instance profile contains permissions restricted exclusively to DynamoDB read/write for its assigned tables. Lambda role has write-only check results and SNS Publish.
                </div>
                <div style={{ backgroundColor: 'var(--color-panel-hover)', padding: 12, border: 'var(--border)' }}>
                  <strong>Security Group Boundaries:</strong> EC2 instances accept inbound HTTP (port 4000) strictly from the ALB Security Group ID—direct internet ingress to EC2 is physically barred.
                </div>
                <div style={{ backgroundColor: 'var(--color-panel-hover)', padding: 12, border: 'var(--border)' }}>
                  <strong>SSRF Attack Guard:</strong> Application code blocks loopback (127.0.0.1), private RFC1918 subnets, and AWS Instance Metadata Service IP (169.254.169.254) from being probed by malicious tenants.
                </div>
                <div style={{ backgroundColor: 'var(--color-panel-hover)', padding: 12, border: 'var(--border)' }}>
                  <strong>Tenant Data Isolation:</strong> Every database read, write, and scan is strictly parameterized by tenantId partition keys.
                </div>
              </div>
            </div>
          )}

          {(activeUnitTab === 'all' || activeUnitTab === 'unit4') && (
            <div className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 700 }}>
                  Unit 4: Virtualization, Auto Scaling & Capacity Planning
                </h3>
                <span className="tag font-mono">Academic Syllabus Pillar</span>
              </div>
              <p style={{ color: 'var(--color-ink-secondary)', fontSize: 14, marginBottom: 10 }}>
                <strong>Hardware Virtualization:</strong> Utilizes AWS Nitro System hypervisor on EC2 t3.micro instances with dedicated burstable CPU credit buckets.
              </p>
              <p style={{ color: 'var(--color-ink-secondary)', fontSize: 14 }}>
                <strong>Auto Scaling Group Mechanics:</strong> Target Tracking Scaling Policy monitors <code>ASGAverageCPUUtilization</code> at 50%. Stress test at 200 concurrent users demonstrates scale-out from 1 to 3 instances, stabilizing p95 latency from 184.5ms down to 28.2ms.
              </p>
            </div>
          )}

          {(activeUnitTab === 'all' || activeUnitTab === 'unit5') && (
            <div className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 700 }}>
                  Unit 5: Web Services Case Study (AWS) & Multi-AZ Design
                </h3>
                <span className="tag font-mono">Academic Syllabus Pillar</span>
              </div>
              <p style={{ color: 'var(--color-ink-secondary)', fontSize: 14, marginBottom: 10 }}>
                <strong>Multi-AZ Redundancy:</strong> Deployed in AWS Region ap-south-1 across Availability Zones <code>ap-south-1a</code> and <code>ap-south-1b</code>. ALB distributes traffic across AZs; if one data center experiences total utility failure, the ALB instantly shifts traffic to healthy instances in the surviving AZ.
              </p>
              <p style={{ color: 'var(--color-ink-secondary)', fontSize: 14 }}>
                <strong>VPC Subnet Architecture:</strong> 2 Public Subnets host the ALB; 2 Private Subnets host the EC2 container instances. S3 and DynamoDB are accessed via VPC Gateway Endpoints to avoid costly NAT Gateway hourly fees ($0.045/hr).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
