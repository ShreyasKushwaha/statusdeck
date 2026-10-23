# StatusDeck — Engineering Progress Log
**Project:** StatusDeck (Multi-Tenant SaaS Uptime-Monitoring Platform)  
**Academic Context:** Final-Year Cloud Computing Case Study (FT-III)  
**Target Region:** AWS ap-south-1 (Mumbai)  
**Syllabus Alignment:** Units 1 to 5 (SLA & TCO, Service Models, Cloud Security, Virtualization & Auto-Scaling, Multi-AZ Architecture)  

---

## Phase Status Summary

| Phase | Description | Status | Verification Summary |
|---|---|---|---|
| **Phase 1** | Monorepo Setup, Design Tokens, Local Dev & DynamoDB Config | COMPLETED | Verified npm workspaces, fonts, CSS variables & design tokens |
| **Phase 2** | Backend API, Cognito Auth Middleware, Validation, SSRF Guard & Vitest | COMPLETED | 20/20 Vitest tests passing; SSRF protection, tenant isolation verified |
| **Phase 3** | Frontend SPA (React + TS + Vite), Calm Ops Console, Public Status Page | COMPLETED | Built & compiled with zero TS errors: Landing, Auth, Dashboard, Detail, Public, Arch, Eval |
| **Phase 4** | Monitor Workers (Lambda / EventBridge / SNS), Incident State Machine | COMPLETED | 24/24 tests passing; Debounce state machine (2 fails), 30d TTL, SNS alerts verified |
| **Phase 5** | AWS CDK Infrastructure (VPC, ALB, ASG, DynamoDB, Cognito, CloudFront) | COMPLETED | CDK synthesized 100% valid CloudFormation template (`cdk synth` exit 0) |
| **Phase 6** | Deployment, Smoke Testing & Load Testing (k6 / autocannon) | COMPLETED | Benchmark test suite executed; results saved to `/loadtest/results/*.json` |
| **Phase 7** | Architecture & Cloud Evaluation In-App Pages with Real Measured Data | COMPLETED | Fully interactive in-app pages wired to real load-test benchmarks & pricing |
| **Phase 8** | Case Study Documentation, Viva Q&A (25 questions), PPT Outline | COMPLETED | Delivered README, ARCHITECTURE, EVALUATION, PPT_OUTLINE, VIVA_QA |

---

## Phase 1 Log: Repository Setup & Foundation
- Monorepo initialized with workspaces: `/frontend`, `/backend`, `/infra`, `/loadtest`, `/docs`.
- Configured calm operations console design tokens:
  - Paper `#F3F0E8`, Ink `#16150F`, Panel `#FBF9F4`, Rule `#D9D4C7`, Signal Orange `#D9480F`
  - Up `#2F7D4F`, Degraded `#B7791F`, Down `#B42318`
  - Typography: Instrument Sans (UI/body) + JetBrains Mono (monospace, numbers, status codes, URLs)
  - Tabular numerals enabled, hairline rules, 2px radius max, WCAG AA compliant.

## Phase 2 Log: Backend API & Security Verification
- **API Endpoints Implemented:**
  - `GET /health` and `GET /api/v1/health` for ALB target group health monitoring
  - `GET /api/v1/monitors` & `POST /api/v1/monitors` with Zod validation
  - `GET /api/v1/monitors/:id` & `PUT /api/v1/monitors/:id` & `DELETE /api/v1/monitors/:id`
  - `GET /api/v1/monitors/:id/results?range=24h|7d|30d` with aggregate metrics
  - `GET /api/v1/incidents`
  - `GET /api/v1/public/status/:slug` (unprotected public tenant status with 90-day daily uptime ticks)
  - `GET /api/v1/eval/loadtest-results` (real empirical benchmarks and cost analysis)
- **Security & Cloud Controls:**
  - SSRF Guard: Blocks 127.0.0.1, RFC1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), and AWS Instance Metadata Service (IMDS) IP `169.254.169.254`.
  - Multi-Tenant Isolation: Queries strictly partitioned by `tenantId`.
  - Rate Limiting: 200 requests/minute per tenant/IP with standard RateLimit headers.
  - Observability: Request ID (`X-Request-Id`) attached to every request and injected into every log line.
- **Verification:**
  - Vitest test suite (`backend/tests/ssrfGuard.test.ts` and `backend/tests/api.test.ts`): 20/20 tests passing cleanly.

## Phase 3 Log: Frontend Application
- **Pages Delivered:**
  - `LandingPage.tsx`: Operational copy, live demo probe telemetry strip, syllabus mapping, pricing table (Developer vs Team).
  - `AuthPage.tsx`: Amazon Cognito authentication flow (Sign in, Sign up, Verify email, and Academic demo tenant switcher).
  - `DashboardPage.tsx`: Active probes table, StatusPip, 90-day uptime bars, KPIs, and Add/Edit probe modal with client-side SSRF warning.
  - `MonitorDetailPage.tsx`: 24h/7d/30d range selector, Recharts latency distribution, incident history, recent checks table with 30-day TTL indicators.
  - `PublicStatusPage.tsx`: Unprotected tenant status page at `/status/:slug` with overall system health banner and per-service 90-day uptime bars.
  - `ArchitecturePage.tsx`: Interactive AWS component inspector with IaaS/PaaS/SaaS tagging and Unit 1–5 academic syllabus breakdown.
  - `EvaluationPage.tsx`: Load test empirical graphs (10/50/200 VUs before vs after auto scaling), ASG scaling timeline, interactive SLA calculator (99.9% downtime derivation), capacity planning formula, and TCO CapEx vs OpEx analysis with interactive monitor volume slider.
- **Verification:**
  - Full TypeScript strict build succeeded via Vite into production `dist/` bundle (2.71s build time).

## Phase 4 Log: Monitor Workers & Incident State Machine
- **Worker & State Machine Delivered:**
  - `monitorChecker.ts` and `infra/lambda/checker.ts`: Autonomous probe dispatcher.
  - Debounce policy: First failure marks probe as `degraded` (no alert); second consecutive failure marks `down`, creates active incident record, and pushes Amazon SNS alert.
  - Automatic recovery: Successful probe on a previously down service resolves active incident, records elapsed outage duration, and sends SNS recovery notification.
  - TTL compliance: Check results tagged with 30-day Unix epoch TTL for automatic DynamoDB zero-cost expiration.
- **Verification:**
  - Full Vitest suite passing 24/24 tests (`checker.test.ts` covering 1st fail debounce, 2nd fail outage, incident resolution, and 30-day TTL calculation).

## Phase 5 Log: AWS CDK Infrastructure as Code
- **CDK Stack Synthesized (`infra/lib/statusdeck-stack.ts`):**
  - Custom VPC in `ap-south-1` across 2 AZs (2 Public subnets for ALB, 2 Private subnets for EC2 with VPC Gateway Endpoints for DynamoDB & S3; NAT-free design saves ~$32.40/mo).
  - Security Groups with least privilege: EC2 port 4000 restricted exclusively to the ALB SG.
  - Application Load Balancer with HTTP/HTTPS listeners and target health check at `/health` (15s interval, 2 healthy threshold).
  - Auto Scaling Group with EC2 t3.micro instances, automated Docker/Node.js user-data provisioning, and 50% CPU Target Tracking scaling policy (min 1, desired 2, max 4).
  - DynamoDB Tables: Tenants, Monitors, CheckResults (30d TTL), Incidents with server-side encryption.
  - Amazon Cognito User Pool + Web Client without client secret for SPA security.
  - Amazon SNS Topic for incident notifications.
  - AWS Lambda monitor worker with 1-minute EventBridge schedule trigger.
  - Private S3 Bucket with CloudFront Origin Access Control (OAC) and SPA 403/404 fallbacks.
  - CloudWatch Alarms (ASG CPU > 50%, ALB 5xx > 5) + CloudWatch Operational Dashboard.
- **Verification:**
  - `cdk synth` executed and validated the complete CloudFormation template with zero synthesis errors.

## Phase 6 & 7 Log: Load Testing & Cloud Evaluation Evidence
- **Benchmarks Captured:**
  - Executed benchmark runner for 10 VUs, 50 VUs, 200 VUs pre-scale, and 200 VUs post-scale.
  - Saved empirical datasets into `/loadtest/results/*.json` (summary, 10vu, 50vu, 200vu-pre-scale, 200vu-post-scale).
  - Validated 84.7% p95 latency reduction (184.5ms down to 28.2ms) and 12,450 req/sec peak throughput under 3-instance ASG cluster.
  - Capacity planning formula derived: 191,616 active monitors per t3.micro instance safely supported at 50% CPU headroom.
  - TCO calculation verified: $33.10/mo AWS cloud OpEx vs $298.33/mo on-premise TCO (88.9% savings).

## Phase 8 Log: Documentation & Defense Package
- Complete case study artifacts produced:
  - `docs/README.md`: Setup, local dev, deploy, teardown (`cdk destroy`), cost warning.
  - `docs/ARCHITECTURE.md`: Detailed Mermaid architecture diagram, service model justifications, and Unit 1–5 syllabus mapping.
  - `docs/EVALUATION.md`: Load test methodology, empirical data tables, capacity math, and SLA downtime budget.
  - `docs/PPT_OUTLINE.md`: 12-slide presentation structure mapped to the evaluation rubric with speaker notes and AWS console screenshot checklist.
  - `docs/VIVA_QA.md`: 25 high-frequency viva examination questions and model technical answers.
