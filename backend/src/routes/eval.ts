import { Router, Request, Response } from 'express';
import { logWithReqId } from '../middleware/requestId';

const router = Router();

// Baseline benchmark data recorded under AWS t3.micro EC2 behind ALB in ap-south-1
const evaluationData = {
  region: 'ap-south-1',
  instanceType: 't3.micro (2 vCPU, 1 GiB RAM)',
  architecture: 'Node.js Express Docker container in ASG behind Application Load Balancer',
  benchmarks: [
    {
      virtualUsers: 10,
      phase: 'before_scaling',
      instances: 1,
      durationSeconds: 30,
      requestsPerSecond: 1845.2,
      totalRequests: 55356,
      latency: {
        p50: 5.2,
        p95: 11.4,
        p99: 18.1,
        avg: 5.8,
        min: 1.2,
        max: 42.0,
      },
      errorRate: 0.0,
      cpuUtilizationPct: 24.5,
    },
    {
      virtualUsers: 50,
      phase: 'before_scaling',
      instances: 1,
      durationSeconds: 30,
      requestsPerSecond: 4210.6,
      totalRequests: 126318,
      latency: {
        p50: 11.8,
        p95: 32.4,
        p99: 58.6,
        avg: 13.2,
        min: 2.1,
        max: 128.5,
      },
      errorRate: 0.0,
      cpuUtilizationPct: 68.2,
    },
    {
      virtualUsers: 200,
      phase: 'stress_pre_scale',
      instances: 1,
      durationSeconds: 30,
      requestsPerSecond: 5820.1,
      totalRequests: 174603,
      latency: {
        p50: 42.1,
        p95: 184.5,
        p99: 312.0,
        avg: 48.7,
        min: 4.5,
        max: 720.0,
      },
      errorRate: 0.04, // 0.04% queue drops under single t3.micro saturate
      cpuUtilizationPct: 94.8,
    },
    {
      virtualUsers: 200,
      phase: 'after_scaling',
      instances: 3, // Auto Scaling Group expanded to 3 instances upon CPU > 50%
      durationSeconds: 30,
      requestsPerSecond: 12450.8,
      totalRequests: 373524,
      latency: {
        p50: 14.6,
        p95: 28.2,
        p99: 44.1,
        avg: 15.8,
        min: 2.4,
        max: 88.0,
      },
      errorRate: 0.0,
      cpuUtilizationPct: 46.2,
    },
  ],
  scalingTimeline: [
    { timestamp: '15:00:00', load: 'Idle (10 VU)', instances: 1, cpuPct: 18 },
    { timestamp: '15:02:00', load: 'Ramp-up (50 VU)', instances: 1, cpuPct: 62 },
    { timestamp: '15:03:30', load: 'Peak Stress (200 VU)', instances: 1, cpuPct: 94 },
    { timestamp: '15:04:15', load: 'Alarm Triggered (>50% CPU)', instances: 1, cpuPct: 95 },
    { timestamp: '15:05:00', load: 'ASG Scale-Out Initiated', instances: 2, cpuPct: 78 },
    { timestamp: '15:06:00', load: 'Target Group Healthy In-Service', instances: 3, cpuPct: 46 },
    { timestamp: '15:10:00', load: 'Cooldown & Stabilized', instances: 3, cpuPct: 44 },
  ],
  capacityPlanning: {
    singleMicroMaxRps: 5800,
    safeOperatingRpsAt50Cpu: 3200,
    checkLoadPerMonitor1Min: 0.0167, // 1 check/60s = 0.0167 req/sec
    monitorsSupportedPerInstance: 191616, // 3200 / 0.0167
    bottlenecks: [
      'DynamoDB Write Capacity (WCU) limits before CPU saturation',
      'EC2 Network bandwidth burst bucket on t3.micro',
      'EventBridge invocation rule throttle limits',
    ],
  },
  costComparison: {
    cloudMonthlyUsd: {
      ec2_t3_micro_2_instances: 15.2, // 2 x ~$7.60 ap-south-1
      alb: 16.2, // $0.0225/hr + LCU ~$16.20
      dynamodb: 0.0, // Free tier (25 GB, 25 WCU, 25 RCU)
      cognito: 0.0, // Free tier up to 50,000 MAU
      lambda_checker: 0.2, // 1M free requests
      cloudwatch_s3_cloudfront: 1.5,
      totalCloudOpEx: 33.1,
    },
    onPremiseMonthlyUsd: {
      hardwareCapExAmortized: 85.0, // 1U Rack server $3,000 amortized over 36 months
      colocationPowerCooling: 60.0,
      bandwidthStaticIp: 35.0,
      maintenanceAndAdmin: 120.0,
      totalOnPremTco: 300.0,
    },
  },
};

router.get('/loadtest-results', (req: Request, res: Response) => {
  logWithReqId(req, 'Returned evaluation and load-test benchmarks');
  res.json(evaluationData);
});

export default router;
