# StatusDeck — 25 High-Frequency Viva Questions & Model Answers
**Academic Context:** Final-Year Cloud Computing Examination (FT-III)  
**System:** StatusDeck (Multi-Tenant SaaS Uptime-Monitoring Platform)

---

### Q1: Why did you use an Application Load Balancer (ALB) instead of a Network Load Balancer (NLB)?
**Answer:** An Application Load Balancer operates at Layer 7 (Application Layer) of the OSI model, allowing path-based routing (e.g., routing `/api/v1/*` to our Express container and `/health` to target group probes), HTTP/HTTPS header inspection, and automated TLS termination. An NLB operates at Layer 4 (Transport Layer) for extreme raw TCP throughput, which is unnecessary for our REST API where Layer 7 routing and health check features are required.

### Q2: What is the difference between IaaS, PaaS, and SaaS in StatusDeck?
**Answer:**
- **IaaS (Infrastructure as a Service):** Our Amazon EC2 virtual machines, Custom VPC subnets, and Auto Scaling Groups where we manage the OS, runtime, and network configurations.
- **PaaS (Platform as a Service):** Amazon DynamoDB, AWS Lambda, Amazon Cognito, and Amazon SNS, where AWS manages the underlying OS, provisioning, patching, and scaling.
- **SaaS (Software as a Service):** StatusDeck itself—the finished multi-tenant uptime monitoring application delivered to end users.

### Q3: How is multi-tenant isolation enforced in StatusDeck?
**Answer:** Isolation is enforced at the database and application boundary. In Amazon DynamoDB, every query uses `tenantId` as the Partition Key (PK). In our Express middleware, Amazon Cognito JWTs are cryptographically validated to extract `tenantId`, guaranteeing that Tenant A cannot query or mutate data belonging to Tenant B.

### Q4: What is Server-Side Request Forgery (SSRF) and how did you prevent it?
**Answer:** SSRF occurs when an attacker tricks a backend server into making requests to internal or unauthorized resources. In monitoring tools, attackers often target the AWS Instance Metadata Service IP `169.254.169.254` to steal IAM credentials. We created a custom SSRF guard that intercepts monitor URLs and blocks loopback (`127.0.0.1`), RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and `169.254.169.254`.

### Q5: How is Auto Scaling configured and triggered?
**Answer:** We created an Auto Scaling Group with a minimum of 1, desired capacity of 2, and maximum of 4 `t3.micro` instances spanning 2 Availability Zones. It uses a Target Tracking Scaling Policy monitoring `ASGAverageCPUUtilization` at 50%. When average CPU exceeds 50% across two 1-minute evaluation periods, the ASG launches additional instances.

### Q6: What did your load testing prove regarding Auto Scaling?
**Answer:** Under 200 virtual users on a single instance, CPU hit 94.8% and p95 latency spiked to 184.5ms. Once the ASG scaled out to 3 instances, p95 latency dropped by 84.7% down to 28.2ms, CPU stabilized at 46.2%, and throughput increased to 12,450 requests/second with 0% error rate.

### Q7: Why use Amazon DynamoDB instead of Amazon RDS (PostgreSQL/MySQL)?
**Answer:** DynamoDB is a managed NoSQL database offering single-digit millisecond latency at any scale with native multi-AZ synchronous replication. For high-velocity time-series check results, DynamoDB provides native Time-To-Live (TTL) that purges expired records at zero compute cost. In contrast, an RDS instance incurs continuous hourly charges even when idle and does not scale down to zero.

### Q8: How does the 30-day DynamoDB TTL work?
**Answer:** Every check result record includes a `ttl` attribute storing a Unix epoch timestamp (current time + 30 days in seconds). DynamoDB continuously scans table metadata in the background and deletes items whose timestamp has elapsed without consuming provisioned write capacity or incurring costs.

### Q9: What is your SLA target and how did you compute allowed downtime?
**Answer:** Our target is **99.9% Availability ("Three Nines")**, meaning an allowed outage budget of 0.1% ($0.001$).
$$\text{Allowed Downtime / Month} = 30 \text{ days} \times 24 \text{ hrs} \times 60 \text{ min} \times 0.001 = \mathbf{43.8 \text{ minutes}}$$
Annually, this equals $365 \times 24 \times 0.001 = \mathbf{8.76 \text{ hours}}$.

### Q10: Why did you implement a 2-consecutive-failure debounce policy?
**Answer:** The public internet experiences transient micro-outages (e.g., DNS timeouts, router packet drops). If every single failed probe triggered an alert, teams would suffer from alert fatigue. By requiring 2 consecutive failures, we filter out transient noise while catching genuine service outages.

### Q11: Explain your CapEx vs. OpEx comparison.
**Answer:**
- **CapEx (Capital Expenditure):** Purchasing an on-premises physical 1U rack server ($3,000 upfront), depreciated over 3 years ($83.33/mo), plus fixed facility costs totaling **$298.33/month**.
- **OpEx (Operating Expenditure):** Deploying on AWS pay-as-you-go cloud services costs **$33.10/month** (2 t3.micro instances + ALB + Free Tier DynamoDB & Lambda). This represents an **88.9% cost reduction** with zero upfront capital commitment.

### Q12: How did you design a NAT-free VPC to save costs?
**Answer:** An AWS NAT Gateway costs $0.045/hour plus data processing (~$32.40/month), which is expensive for student Free Tier architectures. We used AWS VPC Gateway Endpoints for Amazon DynamoDB and Amazon S3. These endpoints are completely free and allow our private EC2 instances to communicate with DynamoDB and S3 over the secure AWS private backbone without a NAT Gateway.

### Q13: What is the role of Amazon Cognito in your architecture?
**Answer:** Amazon Cognito manages user directory pools, self-service user registration, password strength enforcement, and email verification. Upon authentication, Cognito issues cryptographically signed RS256 JSON Web Tokens (JWTs) containing user identity and custom `tenantId` claims.

### Q14: How does the Express backend verify Cognito JWTs?
**Answer:** Our `authMiddleware` fetches Cognito's JSON Web Key Set (JWKS) public keys, verifies the asymmetric RS256 signature, validates the token expiration (`exp`) and audience (`aud`), and extracts the `tenantId` to inject into the request context.

### Q15: How does Multi-AZ (Availability Zone) deployment provide fault tolerance?
**Answer:** We deployed subnets across `ap-south-1a` and `ap-south-1b`. If an entire AWS data center loses utility power or suffers a physical fiber cut, the Application Load Balancer detects unhealthy target nodes in that AZ within seconds and routes 100% of incoming traffic to surviving healthy instances in the other AZ.

### Q16: How does the capacity planning derivation work?
**Answer:** Load testing showed a single `t3.micro` safely sustains 3,200 requests/second at 50% CPU. A monitor checking once every 60 seconds generates 0.0167 req/sec. Dividing $3,200 / 0.0167$ yields **191,616 monitors** supported per instance. Thus, a 2-instance cluster easily handles over 380,000 active monitors.

### Q17: What are the primary bottlenecks in scaling StatusDeck?
**Answer:** While EC2 CPU scales horizontally via ASG, the real-world bottlenecks are:
1. **DynamoDB Write Capacity (WCU):** High check frequency requires On-Demand billing or auto-scaled provisioned capacity.
2. **CPU Credit Exhaustion:** `t3.micro` instances rely on burst credits; sustained high load exhausts baseline credits unless configured with T3 Unlimited.
3. **EventBridge Rule Limits:** Mitigated by batching multiple monitors per Lambda execution payload.

### Q18: What is CloudFront Origin Access Control (OAC)?
**Answer:** OAC is AWS's modern method to secure S3 buckets behind CloudFront. It signs requests between CloudFront and S3 using SigV4, ensuring users cannot bypass CloudFront to download assets directly from S3, allowing S3 to have `BlockPublicAccess.BLOCK_ALL` enabled.

### Q19: Why use AWS Lambda for monitor checks instead of a continuous Node.js background loop on EC2?
**Answer:** Running monitor checks in an EC2 loop would consume continuous CPU cycles, risk crashing the API process, and fail to scale horizontally. With AWS Lambda and EventBridge, each probe execution is serverless, isolated, scales automatically, and benefits from AWS's 1 million free monthly invocations.

### Q20: What is the purpose of the `/health` endpoint?
**Answer:** The `/health` endpoint is polled by the Application Load Balancer target group every 15 seconds. If the container or node process becomes unresponsive, it returns non-200, prompting the ALB to stop routing traffic to that instance and the ASG to terminate and replace the unhealthy host.

### Q21: What information is included in your CloudWatch Alarms?
**Answer:** We configured two core alarms:
1. `AsgHighCpuAlarm`: Fires when average CPU across the ASG exceeds 50% for 2 consecutive 1-minute periods.
2. `Alb5xxAlarm`: Fires when the ALB records more than five 5xx server errors in 1 minute, signaling backend application crashes.

### Q22: What AWS services fall strictly within the AWS Free Tier?
**Answer:**
- DynamoDB: 25 GB storage + 25 WCU + 25 RCU free forever.
- Lambda: 1,000,000 requests/month + 3.2M seconds compute time free forever.
- Cognito: 50,000 Monthly Active Users (MAUs) free forever.
- EC2: 750 hours/month of `t3.micro`/`t2.micro` free for 12 months.
- S3 & CloudFront: 5 GB S3 storage + 1 TB CloudFront egress free for 12 months.

### Q23: What AWS service falls outside the Free Tier or incurs minor costs?
**Answer:** The Application Load Balancer (ALB). While AWS offers 750 hours of shared LCU in the 12-month free tier, excess LCUs or usage beyond 12 months costs approximately $0.0225/hour (~$16.20/month). We explicitly documented this in our TCO model.

### Q24: How does StatusDeck maintain documentation and deployment reproducibility?
**Answer:** The entire infrastructure is defined as code using AWS CDK in TypeScript (`infra/lib/statusdeck-stack.ts`). Anyone with an AWS account can deploy the entire stack using `cdk deploy` and cleanly delete all resources using `cdk destroy`.

### Q25: Why did you choose a "Calm Operations Console" design for the UI?
**Answer:** Monitoring platforms are operational control centers used during stressful outages. Bright gradients, drop shadows, and animations create cognitive fatigue. Our calm operational console uses dense information hierarchy, tabular JetBrains Mono numerals, and clean 1px rules, ensuring engineers can quickly assess incident status with clarity.
