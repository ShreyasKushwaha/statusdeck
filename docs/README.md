# StatusDeck — Multi-Tenant SaaS Uptime-Monitoring Platform
**Final-Year Cloud Computing Case Study (FT-III)**  
**Region:** AWS `ap-south-1` (Mumbai)  
**Syllabus Coverage:** Units 1 to 5 (SLA, TCO, Service Models, Cloud Security, Virtualization & Auto-Scaling, Multi-AZ Architecture)

---

## 1. Executive Summary
Small teams and startups cannot afford enterprise monitoring tools ($100+/month). **StatusDeck** provides continuous, multi-tenant HTTP endpoint health probing from multi-AZ AWS infrastructure, isolates tenants at database partition boundaries, triggers debounced incident alerts (2 consecutive failures) via Amazon SNS, and publishes public status pages at `/status/:slug`.

StatusDeck demonstrates cloud computing concepts including:
- **Unit 1:** 99.9% Availability SLA (max 43.8 min/month downtime) and TCO comparison (CapEx vs OpEx).
- **Unit 2:** IaaS (VPC, EC2, ASG), PaaS/FaaS (DynamoDB, Lambda, Cognito, SNS), and SaaS (StatusDeck product).
- **Unit 3:** Cloud Security: Cognito JWT verification, IAM least privilege, security group isolation, and SSRF prevention blocking IMDS `169.254.169.254`.
- **Unit 4:** Virtualization (EC2 t3.micro AMI), Application Load Balancer, and Auto Scaling Group at 50% CPU target.
- **Unit 5:** Multi-AZ deployment (ap-south-1a, ap-south-1b) with NAT-free VPC Gateway Endpoints.

---

## 2. Monorepo Structure

```
cloud/
├── backend/            # Express + TypeScript API, DynamoDB DAL, SSRF guard, Vitest suite
│   ├── Dockerfile      # Multi-stage production container image
│   ├── src/            # API routes, middleware (auth, requestId, rateLimiter), workers
│   └── tests/          # 24/24 Vitest integration tests (auth, ssrf, state machine)
├── frontend/           # React 18 + TypeScript + Vite SPA
│   ├── src/pages/      # Landing, Auth, Dashboard, Detail, Public, Architecture, Evaluation
│   ├── src/components/ # StatusPip, UptimeBar90Days, LatencyChart, AddEditModal, Navbar
│   └── src/index.css   # Bespoke "Calm Operations Console" CSS design tokens
├── infra/              # AWS CDK TypeScript Infrastructure as Code
│   ├── bin/infra.ts    # CDK App entry point
│   ├── lib/            # Multi-AZ VPC, ALB, ASG, DynamoDB, Cognito, CloudFront, Lambda
│   └── lambda/         # FaaS EventBridge monitor checker worker
├── loadtest/           # Autocannon / k6 benchmark runner & empirical results
│   ├── run-all.js      # Benchmarks 10, 50, 200 VUs pre-scale and post-scale
│   └── results/        # Empirical JSON measurements captured from test runs
└── docs/               # Academic case study deliverables
    ├── PROGRESS.md     # Engineering phases progress log
    ├── ARCHITECTURE.md # Architecture topology, Mermaid diagram & service justification
    ├── EVALUATION.md   # Load test empirical methodology, cost analysis & SLA derivation
    ├── PPT_OUTLINE.md  # 10-12 slide presentation outline mapped to FT-III rubric
    └── VIVA_QA.md      # 25 viva questions and answers
```

---

## 3. Local Development Setup

### Prerequisites
- Node.js v20+ / v24+
- npm v10+

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Run Backend Tests
Run the complete Vitest test suite (SSRF guard, API routes, multi-tenant isolation, debounce state machine):
```bash
npm --workspace=backend test
```

### Step 3: Start Local API Server
```bash
npm --workspace=backend run dev
```
The API server starts on `http://localhost:4000`:
- Root Health Probe: `http://localhost:4000/health`
- Public Status Page: `http://localhost:4000/api/v1/public/status/acme-corp`
- Evaluation Benchmarks: `http://localhost:4000/api/v1/eval/loadtest-results`

### Step 4: Start Frontend Development Server
In a separate terminal:
```bash
npm --workspace=frontend run dev
```
Open `http://localhost:3000` to access the StatusDeck Operations Console.

---

## 4. AWS Cloud Deployment (`cdk deploy`)

### Prerequisites for AWS
- AWS CLI configured with active credentials (`aws configure`)
- Target Region: `ap-south-1` (Mumbai)
- AWS CDK bootstrapped (`npx cdk bootstrap aws://<ACCOUNT-ID>/ap-south-1`)

### Step 1: Build Packages
```bash
npm run build:all
```

### Step 2: Synthesize CloudFormation Template
```bash
npm --workspace=infra exec cdk synth
```

### Step 3: Deploy to AWS
> [!IMPORTANT]
> Ensure you have confirmed billing limits before deploying billable AWS resources.
```bash
npm --workspace=infra exec cdk deploy
```

Outputs returned upon successful deployment:
1. `CloudFrontUrl`: High-speed HTTPS CDN URL for the React frontend.
2. `AlbDnsName`: Application Load Balancer endpoint distributing traffic to the EC2 Auto Scaling Group.
3. `CognitoUserPoolId`: ID of the Amazon Cognito User Pool.
4. `CognitoClientId`: Public client ID for browser authentication.
5. `SnsTopicArn`: Topic ARN for outage email alerts.

---

## 5. Teardown & Cost Cleanup (`cdk destroy`)

> [!CAUTION]
> **Cost Warning:** When testing or academic evaluation is complete, destroy all provisioned AWS resources to avoid ongoing charges for ALB ($0.0225/hr = ~$16.20/month) and running EC2 instances beyond Free Tier limits.

To completely tear down and delete all provisioned AWS resources:
```bash
npm --workspace=infra exec cdk destroy
```
Type `y` when prompted to confirm stack deletion.

---

## 6. Security & Operational Design Highlights
- **SSRF Prevention:** Custom IP verification algorithm validates every target URL and blocks loopback (`127.0.0.1`), RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and AWS Instance Metadata Service IP `169.254.169.254`.
- **Tenant Isolation:** Enforced strictly by `tenantId` partition keys across all DynamoDB queries and Cognito JWT claims.
- **Debounced Alerts:** Avoids alert spam by requiring 2 consecutive failed probes before flagging a service as `down` and emitting an Amazon SNS alert.
- **S3 & CloudFront:** S3 public access is completely blocked; content is served strictly via CloudFront Origin Access Control (OAC) with HTTPS TLS 1.3.
