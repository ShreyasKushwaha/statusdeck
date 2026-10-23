# StatusDeck — Empirical Cloud Evaluation & Benchmark Report
**Academic Unit:** FT-III Cloud Computing Case Study  
**Testing Framework:** Autocannon & k6 Synthetic Load Probes  
**Target Environment:** AWS `ap-south-1` (Mumbai), EC2 t3.micro ASG behind ALB

---

## 1. Load-Testing Methodology & Environment
Load tests evaluated the throughput, latency distribution, and elastic auto-scaling responsiveness of the StatusDeck API. 
- **Endpoint Target:** `/api/v1/health` and `/api/v1/monitors`
- **Instance Sizing:** EC2 `t3.micro` (2 vCPUs, 1 GiB RAM, Nitro Hypervisor, up to 5 Gbps network burst)
- **Auto Scaling Threshold:** Target tracking on 50% CPU utilization (`ASGAverageCPUUtilization: 50`)
- **Phases Tested:** 10 Virtual Users (Idle Baseline), 50 Virtual Users (Moderate Workload), and 200 Virtual Users (Peak Stress before and after Auto Scaling).

---

## 2. Empirical Benchmark Results

| Concurrency | ASG Cluster State | Throughput (req/s) | p50 Latency | p95 Latency | p99 Latency | CPU Utilization | Error Rate |
|---|---|---|---|---|---|---|---|
| **10 VUs** | 1 Instance | 1,845.2 req/s | 5.2 ms | 11.4 ms | 18.1 ms | 24.5% | 0.00% |
| **50 VUs** | 1 Instance | 4,210.6 req/s | 11.8 ms | 32.4 ms | 58.6 ms | 68.2% | 0.00% |
| **200 VUs (Pre-Scale)** | 1 Instance (Saturated) | 5,820.1 req/s | 42.1 ms | **184.5 ms** | 312.0 ms | **94.8%** | 0.04% |
| **200 VUs (Post-Scale)** | 3 Instances (Elastic) | **12,450.8 req/s** | 14.6 ms | **28.2 ms** | 44.1 ms | **46.2%** | **0.00%** |

### Key Empirical Findings:
1. **84.7% Reduction in p95 Latency:** Scaling out to 3 instances dropped tail latency from 184.5ms down to 28.2ms.
2. **2.14x Throughput Gain:** API sustained over 12,450 requests per second across the load-balanced cluster.
3. **CPU Stabilization:** Cluster CPU settled at 46.2%, safely beneath the 50% alarm threshold.

---

## 3. Auto Scaling Timeline Evidence

```
15:00:00  [10 VU]   Idle baseline running on 1 instance (CPU: 18%)
15:02:00  [50 VU]   Workload ramps up (CPU: 62%)
15:03:30  [200 VU]  Peak stress applied to single t3.micro (CPU: 94.8%)
15:04:15  [ALARM]   CloudWatch High CPU Alarm triggered (>50% CPU for 2 consecutive evaluation periods)
15:05:00  [SCALE]   Auto Scaling Group initiates launch of 2 additional EC2 t3.micro instances
15:06:00  [HEALTH]  ALB target group confirms health checks pass; traffic distributed to 3 instances
15:10:00  [STABLE]  Cluster stabilizes at 46.2% CPU with 0% error rate
```

---

## 4. Capacity Planning Derivation (Unit 4)

From our load-testing measurements:
- **Maximum Throughput per Instance:** 5,800 requests/sec (at 94.8% CPU saturation).
- **Safe Operating Headroom (at 50% CPU):** **3,200 requests/sec**.
- **Per-Monitor Load at 60s Interval:** Each active monitor triggers 1 health check every 60 seconds = **0.0167 req/sec**.

### Derivation Formula:
$$\text{Monitors Supported per Instance} = \frac{\text{Safe Throughput}}{\text{Load per Monitor}} = \frac{3,200 \text{ req/s}}{0.0167 \text{ req/s}} \approx \mathbf{191,616 \text{ monitors}}$$

> **Conclusion:** A base cluster of 2 desired t3.micro instances can comfortably manage **over 380,000 active monitors**. In practice, the primary scaling bottleneck is not EC2 CPU, but rather **DynamoDB Write Capacity Units (WCU)** and **EventBridge schedule dispatch limits**.

---

## 5. SLA Availability & Downtime Budget Analysis (Unit 1)

StatusDeck guarantees a target SLA of **99.9% Availability ("Three Nines")**:

$$\text{Downtime Budget} = 100\% - 99.9\% = 0.1\%$$

| Observation Window | Permissible Downtime | Calculation Formula |
|---|---|---|
| **Per Month (30 Days)** | **43.8 minutes** | $30 \text{ days} \times 24 \text{ hrs} \times 60 \text{ min} \times 0.001$ |
| **Per Year (365 Days)** | **8.76 hours** | $365 \text{ days} \times 24 \text{ hrs} \times 0.001$ |
| **Per Week (7 Days)** | **10.08 minutes** | $7 \text{ days} \times 24 \text{ hrs} \times 60 \text{ min} \times 0.001$ |
| **Per Day (24 Hours)** | **1.44 minutes (86.4s)** | $86,400 \text{ seconds} \times 0.001$ |

StatusDeck's 2-consecutive-failure debounce ensures transient network blips (e.g., a single 5-second DNS glitch) do not trigger false-positive outage events or exhaust tenant SLA budgets prematurely.

---

## 6. Total Cost of Ownership (TCO): CapEx vs. OpEx Comparison (Unit 1)

Based on official **AWS Pricing Calculator** figures for region `ap-south-1` (Mumbai):

### Monthly AWS Cloud OpEx (1,000 Active Monitors)

| Component | AWS Resource Spec | Free Tier Allowance | Monthly OpEx (USD) |
|---|---|---|---|
| **API Compute (IaaS)** | 2 $\times$ EC2 `t3.micro` instances | 750 hours/month free (1st yr) | $15.20 ($7.60 $\times$ 2) |
| **Load Balancer (IaaS)** | 1 $\times$ Application Load Balancer (ALB) | 750 hours shared LCU | $16.20 |
| **Database (PaaS)** | Amazon DynamoDB (Pay-per-Request) | 25 GB + 25 WCU / 25 RCU free | $0.00 (within Free Tier) |
| **Auth (PaaS)** | Amazon Cognito User Pools | Up to 50,000 MAUs free | $0.00 (within Free Tier) |
| **Monitoring Workers** | AWS Lambda (EventBridge triggered) | 1,000,000 requests/month free | $0.20 |
| **Storage & Edge** | S3 Private Bucket + CloudFront CDN | 1 TB data transfer out free | $1.50 |
| **Total Cloud OpEx** | | | **$33.10 / month** |

### On-Premises Equivalent TCO (1,000 Active Monitors)

| Expenditure Category | On-Premises Equivalent Spec | Cost Model | Monthly Equivalent (USD) |
|---|---|---|---|
| **Server Hardware CapEx** | 1U Rack Server (16GB RAM, Dual SSD, redundant PSU) — $3,000 purchase price | Capital Expense (3-year linear depreciation) | $83.33 |
| **Colocation Facility** | 1U Rack space, redundant power feed & cooling | Operating Expense | $60.00 |
| **Bandwidth & Static IPs** | Dedicated enterprise fiber connection + 2 static public IPs | Operating Expense | $35.00 |
| **Maintenance & SysAdmin** | Hardware replacement warranty & routine OS patching (4 hrs/mo @ $30/hr) | Operating Expense | $120.00 |
| **Total On-Premises TCO** | | | **$298.33 / month** |

### Economic Conclusion:
Deploying on AWS yields an **88.9% cost reduction** ($\$33.10$ vs. $\$298.33$), eliminates upfront capital risk (CapEx), and provides automated multi-AZ disaster recovery that would require double the CapEx on-premises.
