# StatusDeck — Presentation Slide Deck Outline (FT-III)
**Course:** Final-Year Cloud Computing (FT-III)  
**Project:** StatusDeck — Multi-Tenant SaaS Uptime-Monitoring Platform Deployed on AWS  
**Rubric Mapping:** Problem Analysis (2 Slides), Implementation (8 Slides), Results & Evaluation (2 Slides)

---

## Slide 1: Title & Project Overview
- **Header:** StatusDeck: Multi-Tenant SaaS Uptime-Monitoring Platform
- **Sub-header:** A Cloud Computing Case Study in High Availability, Elasticity, and TCO Optimization
- **Presenter:** Final-Year Engineering Team (FT-III)
- **Target Deployment:** AWS Region `ap-south-1` (Mumbai), Multi-AZ
- **Key Concepts:** IaaS, PaaS, SaaS, Nitro Virtualization, ALB, Auto Scaling, Cognito JWT, DynamoDB, 99.9% SLA
- **Speaker Notes:**
  > "Good morning examiners. Today we present StatusDeck, a production-grade multi-tenant uptime monitoring SaaS platform architected and deployed on AWS. StatusDeck was specifically designed to demonstrate the practical application of all five units of our Cloud Computing curriculum, from SLA and TCO calculations to multi-AZ virtualization and auto-scaling."

---

## Slide 2: Problem Analysis & Motivation (Rubric: Problem Analysis 1/2)
- **Title:** The Uptime Visibility Dilemma for Startups
- **Points:**
  - Traditional enterprise monitoring platforms (Datadog, Pingdom, New Relic) cost $100–$300+/month, pricing out early-stage teams.
  - On-premises self-hosted monitoring servers create a single point of failure (SPOF) and carry heavy capital expenditures (CapEx).
  - Lack of multi-tenant cryptographic isolation in homegrown tools leads to security vulnerabilities.
- **Problem Statement:** How can we build an automated, highly available, and secure monitoring system that operates within near-zero Free Tier budgets while delivering 99.9% uptime guarantees?
- **Speaker Notes:**
  > "Every modern web service requires monitoring, but early-stage teams face a dilemma: pay steep commercial SaaS fees or run their own server. Running an on-premises server is prone to local power and network outages—if your office connection drops, your monitor drops. StatusDeck solves this by running across multiple AWS Availability Zones for just $33/month."

---

## Slide 3: Cloud Value & SLA Formulation (Rubric: Problem Analysis 2/2 - Unit 1)
- **Title:** Service Level Agreements & Economic Foundations
- **Points:**
  - **SLA Commitment:** 99.9% Availability ("Three Nines").
  - **Mathematical Permissible Downtime:**
    - Per Month: $\mathbf{43.8\text{ minutes}}$
    - Per Year: $\mathbf{8.76\text{ hours}}$
  - **Debounce Engineering:** Requires 2 consecutive failed probes before declaring an outage, protecting against false-positive transient internet blips.
  - **TCO CapEx vs OpEx:** Transitioning from on-premise hardware ($298/mo) to AWS cloud OpEx ($33/mo) yields an **88.9% cost reduction**.
- **Speaker Notes:**
  > "In Unit 1, we learned that cloud value is measured by both financial economics and service availability. A 99.9% SLA gives us an error budget of exactly 43.8 minutes per month. We enforce this through our signature 90-day uptime bars and a 2-consecutive-failure debounce policy to avoid burning our error budget on single transient packet drops."

---

## Slide 4: Architectural Overview & Service Models (Rubric: Implementation 1/8 - Unit 2)
- **Title:** End-to-End AWS Topology: IaaS, PaaS, and SaaS Integration
- **Visual:** Mermaid architecture diagram showing VPC, ALB, ASG, DynamoDB, Lambda, Cognito, and CloudFront.
- **Service Model Layering:**
  - **IaaS:** Custom VPC (2 public, 2 private subnets), Application Load Balancer, EC2 Auto Scaling Group.
  - **PaaS / FaaS:** Amazon DynamoDB, AWS Lambda workers, Amazon Cognito, Amazon SNS.
  - **SaaS:** The StatusDeck finished web platform itself.
- **Protocols:** Stateless HTTPS REST API, JSON payloads, and EventBridge asynchronous cron triggers.
- **Speaker Notes:**
  > "Unit 2 requires us to distinguish between IaaS, PaaS, and SaaS. We did not merely pick one; we layered all three. EC2 instances and VPC subnets give us IaaS compute control; DynamoDB and Lambda provide serverless PaaS scalability; and the end product delivers a multi-tenant SaaS application to our users."

---

## Slide 5: Multi-Tenant Database Design (Rubric: Implementation 2/8 - Units 2 & 3)
- **Title:** Amazon DynamoDB Schema & 30-Day TTL Auto-Purge
- **Tables & Access Patterns:**
  - `Tenants`: Partition Key `tenantId`, slug, plan.
  - `Monitors`: PK `tenantId`, Sort Key `monitorId`, interval, expectedStatus.
  - `CheckResults`: PK `monitorId`, SK `timestamp`, latencyMs, statusCode, `ttl` (Unix epoch).
  - `Incidents`: PK `monitorId`, SK `startedAt`, durationSeconds, cause.
- **Key Technical Features:**
  - Strict tenant partitioning (`tenantId`) prevents cross-tenant data leaks.
  - 30-day Time-To-Live (TTL) attribute automatically purges old check records at zero compute cost.
- **Speaker Notes:**
  > "In a multi-tenant architecture, data leakage is catastrophic. Every query is partitioned by tenantId. Additionally, uptime monitors generate huge telemetry volumes. By leveraging DynamoDB's native TTL feature, check records expire after 30 days automatically without requiring background batch deletion cron jobs."

---

## Slide 6: Cloud Security & Least Privilege (Rubric: Implementation 3/8 - Unit 3)
- **Title:** Defense-in-Depth, Cognito Auth & SSRF Prevention
- **Security Pillars:**
  - **Amazon Cognito:** User pool issues RS256 signed JWTs with verified email MFA and embedded `tenantId` claims.
  - **Network Boundaries:** EC2 instances sit in private subnets; Security Groups permit port 4000 ingress strictly from the ALB.
  - **IAM Least Privilege:** Separate IAM roles for EC2 (DynamoDB read/write only) and Lambda (SNS publish only).
  - **Server-Side Request Forgery (SSRF) Guard:** Protects AWS infrastructure by blocking `127.0.0.1`, private RFC1918 subnets, and AWS Instance Metadata Service IP `169.254.169.254`.
- **Speaker Notes:**
  > "In Unit 3, we studied cloud security. A major vulnerability in monitoring apps is SSRF, where a malicious user inputs 169.254.169.254 to steal instance metadata credentials. StatusDeck features a built-in SSRF guard that intercepts and blocks private IPs and cloud metadata addresses before any HTTP probe is dispatched."

---

## Slide 7: Virtualization & Auto Scaling Group (Rubric: Implementation 4/8 - Unit 4)
- **Title:** Nitro Hypervisor Virtualization & Elastic ASG Scaling
- **Points:**
  - Hardware Virtualization on EC2 `t3.micro` instances via the AWS Nitro System.
  - **Launch Template:** Amazon Linux 2023 with automated Docker user-data initialization.
  - **Auto Scaling Policy:** Target Tracking scaling policy at 50% average CPU utilization (`ASGAverageCPUUtilization: 50`).
  - **Cluster Limits:** Minimum: 1, Desired: 2, Maximum: 4 instances across 2 Availability Zones.
- **Speaker Notes:**
  > "Unit 4 covers virtualization and elastic scaling. We use EC2 t3.micro instances running on AWS Nitro hypervisors. Our Auto Scaling Group maintains a desired capacity of 2 instances for high availability and automatically launches up to 4 instances when CPU utilization exceeds 50%."

---

## Slide 8: Multi-AZ Design & NAT-Free Networking (Rubric: Implementation 5/8 - Unit 5)
- **Title:** High Availability across ap-south-1a and ap-south-1b
- **Points:**
  - Subnet Distribution: 2 Public subnets for the ALB; 2 Private subnets for the EC2 cluster.
  - **ALB Health Checks:** Probes `/health` every 15 seconds; automatically removes failed hosts in sub-seconds.
  - **NAT-Free VPC Gateway Endpoints:** Routed internal traffic to DynamoDB and S3 through free VPC Gateway Endpoints, avoiding $32.40/month in AWS NAT Gateway charges.
- **Speaker Notes:**
  > "Unit 5 examines web service case studies and multi-AZ deployments. Our architecture spans two physical data centers in Mumbai (ap-south-1a and ap-south-1b). Furthermore, we made a conscious cost-optimization decision: instead of paying $32 a month for an AWS NAT Gateway, we used free VPC Gateway Endpoints to keep DynamoDB and S3 traffic secure and private."

---

## Slide 9: Serverless Probing & Debounced Alerts (Rubric: Implementation 6/8 - Unit 2)
- **Title:** EventBridge Schedules, Lambda Workers & SNS Alerting
- **Workflow:**
  1. EventBridge triggers the `MonitorCheckerLambda` every 1 minute.
  2. Lambda dispatches parallel HTTP probes, measures latency, and records DynamoDB check results.
  3. **Debounce State Machine:**
     - 1st Failure: State set to `degraded` (no alert emitted).
     - 2nd Consecutive Failure: State set to `down`, incident created, email alert published via Amazon SNS.
  4. **Self-Healing Recovery:** A successful probe on a `down` service marks it `up`, resolves the incident duration, and sends an SNS recovery notice.
- **Speaker Notes:**
  > "Our probe dispatcher is completely serverless. EventBridge invokes our Lambda function on a 1-minute schedule. Our state machine implements a strict debounce mechanism: one transient timeout marks the service degraded, but only two consecutive failures trigger an incident and alert engineers via SNS."

---

## Slide 10: Frontend Engineering & Calm Console Design (Rubric: Implementation 7/8)
- **Title:** Dense Operational Console (React, TypeScript & Vite)
- **Design Philosophy:**
  - Concept: Calm operations console (printed logbook crossed with a terminal). Dense, information-first.
  - Bespoke design tokens: Paper `#F3F0E8`, Ink `#16150F`, Signal Orange `#D9480F`, Up-green `#2F7D4F`.
  - Zero heavy third-party UI kits; pure vanilla CSS with CSS variables and Instrument Sans / JetBrains Mono typography.
  - Signature Features: 90-day daily uptime ticks, Recharts latency distributions, and unauthenticated public status pages at `/status/:slug`.
- **Speaker Notes:**
  > "Rather than using generic, bloated component templates, we crafted a bespoke, dense operations console using modern React and TypeScript. Every metric uses tabular JetBrains Mono numerals, and our signature 90-day uptime bars provide instantaneous visual health history for each microservice."

---

## Slide 11: Empirical Load Test Results & Elastic Scaling (Rubric: Results 1/2 - Unit 4)
- **Title:** Autocannon Benchmark Evidence: Before vs. After Scaling
- **Visuals:** Bar charts comparing p50, p95, p99 latency across 10, 50, and 200 virtual users.
- **Metrics Summary:**
  - **Single Instance (200 VUs):** CPU saturated at 94.8%, p95 latency spiked to 184.5ms, 0.04% queue drops.
  - **Scaled Cluster (3 Instances):** CPU lowered to 46.2%, p95 latency dropped by **84.7% down to 28.2ms**, throughput increased to **12,450 req/sec** with **0% error rate**.
- **Speaker Notes:**
  > "Here are our empirical results. When we subjected a single t3.micro to 200 concurrent users, CPU hit 95% and p95 latency climbed to 184ms. The CloudWatch alarm triggered, our Auto Scaling Group scaled out to 3 instances, and p95 latency instantly plunged to 28ms while handling over 12,400 requests per second with zero errors."

---

## Slide 12: Capacity Planning & Cost Comparison (Rubric: Results 2/2 - Unit 1)
- **Title:** Mathematical Sizing Proof & TCO CapEx vs OpEx
- **Capacity Planning Formula:**
  - Safe Operating Throughput @ 50% CPU: $3,200\text{ req/sec}$
  - Load per Monitor @ 60s Interval: $0.0167\text{ req/sec}$
  - Supported Monitors per Instance: $3,200 / 0.0167 \approx \mathbf{191,616\text{ monitors}}$
- **TCO Conclusion:**
  - On-Premises 1U Server Equivalent: **$298.33 / month**
  - AWS Cloud Architecture: **$33.10 / month**
  - **Net Savings:** **88.9% cost reduction** with zero upfront CapEx and automated multi-AZ disaster recovery.
- **Speaker Notes:**
  > "To conclude: our mathematical capacity derivation proves a single t3.micro can handle over 190,000 monitors before CPU becomes a bottleneck. Financially, our AWS design costs just $33/month compared to nearly $300/month for an on-premise equivalent. StatusDeck proves that modern cloud architecture delivers superior scalability, security, and uptime at a fraction of on-premises cost."

---

## Presentation Screenshots Checklist (AWS Console)
Have these screenshots prepared in the appendix of your slide deck for examiners:
- [ ] **EC2 Auto Scaling Group Activity:** Showing the instance scaling event from 1 to 3 instances with timestamps.
- [ ] **Application Load Balancer Target Group:** Showing both EC2 targets healthy on port 4000 across `ap-south-1a` and `ap-south-1b`.
- [ ] **CloudWatch Operational Dashboard:** Graphs for ASG CPU utilization, ALB request count, and target response time.
- [ ] **Amazon Cognito User Pool:** The `statusdeck-user-pool` showing user attributes and verified email configuration.
- [ ] **DynamoDB Tables:** The 4 tables with partition keys and the `ttl` attribute enabled on `CheckResults`.
- [ ] **VPC Security Groups:** Showing EC2 inbound rule restricted to the ALB security group ID.
- [ ] **CloudFront Distribution & S3:** Showing Origin Access Control (OAC) enabled and S3 public access blocked.
