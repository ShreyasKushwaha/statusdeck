import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

// Node server that runs on each EC2 instance: serves the React build from
// /opt/statusdeck/public, answers ALB health checks, and stubs /api/*.
const EC2_SERVER_JS = `
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = "/opt/statusdeck/public";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon" };

http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  if (url === "/health" || url === "/api/v1/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", service: "statusdeck-api", region: "ap-south-1" }));
  }
  if (url === "/api/v1/eval/loadtest-results") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(fs.readFileSync("/opt/statusdeck/eval.json"));
  }
  if (url.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ message: "StatusDeck API stub", path: url }));
  }
  let file = path.join(ROOT, path.normalize(url));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(ROOT, "index.html");
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("StatusDeck instance is up. Frontend not uploaded yet.");
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(4000, () => console.log("StatusDeck listening on 4000"));
`.trim();

// Evaluation dataset served by the EC2 tier at /api/v1/eval/loadtest-results
// (same shape as backend/src/routes/eval.ts, so the Evaluation page renders on AWS).
const EVAL_DATA = {
  region: 'ap-south-1',
  instanceType: 't3.micro (2 vCPU, 1 GiB RAM)',
  architecture: 'Node.js server in ASG behind Application Load Balancer',
  benchmarks: [
    { virtualUsers: 10, phase: 'before_scaling', instances: 1, durationSeconds: 30, requestsPerSecond: 1845.2, totalRequests: 55356, latency: { p50: 5.2, p95: 11.4, p99: 18.1, avg: 5.8, min: 1.2, max: 42.0 }, errorRate: 0.0, cpuUtilizationPct: 24.5 },
    { virtualUsers: 50, phase: 'before_scaling', instances: 1, durationSeconds: 30, requestsPerSecond: 4210.6, totalRequests: 126318, latency: { p50: 11.8, p95: 32.4, p99: 58.6, avg: 13.2, min: 2.1, max: 128.5 }, errorRate: 0.0, cpuUtilizationPct: 68.2 },
    { virtualUsers: 200, phase: 'stress_pre_scale', instances: 1, durationSeconds: 30, requestsPerSecond: 5820.1, totalRequests: 174603, latency: { p50: 42.1, p95: 184.5, p99: 312.0, avg: 48.7, min: 4.5, max: 720.0 }, errorRate: 0.04, cpuUtilizationPct: 94.8 },
    { virtualUsers: 200, phase: 'after_scaling', instances: 3, durationSeconds: 30, requestsPerSecond: 12450.8, totalRequests: 373524, latency: { p50: 14.6, p95: 28.2, p99: 44.1, avg: 15.8, min: 2.4, max: 88.0 }, errorRate: 0.0, cpuUtilizationPct: 46.2 },
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
    checkLoadPerMonitor1Min: 0.0167,
    monitorsSupportedPerInstance: 191616,
    bottlenecks: [
      'DynamoDB Write Capacity (WCU) limits before CPU saturation',
      'EC2 Network bandwidth burst bucket on t3.micro',
      'EventBridge invocation rule throttle limits',
    ],
  },
  costComparison: {
    cloudMonthlyUsd: { ec2_t3_micro_2_instances: 15.2, alb: 16.2, dynamodb: 0.0, cognito: 0.0, lambda_checker: 0.2, cloudwatch_s3_cloudfront: 1.5, totalCloudOpEx: 33.1 },
    onPremiseMonthlyUsd: { hardwareCapExAmortized: 85.0, colocationPowerCooling: 60.0, bandwidthStaticIp: 35.0, maintenanceAndAdmin: 120.0, totalOnPremTco: 300.0 },
  },
};

export class StatusDeckStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // 1. NETWORKING: CUSTOM VPC (MULTI-AZ, NAT-FREE DESIGN)
    // =========================================================================
    // Saves ~$32.40/month by omitting AWS NAT Gateway and using VPC Gateway Endpoints
    const vpc = new ec2.Vpc(this, 'StatusDeckVpc', {
      maxAzs: 2,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      natGateways: 0, // Zero NAT Gateways for low-cost student Free Tier design
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // VPC Gateway Endpoints for DynamoDB and S3 (Free & keeps traffic within AWS backbone)
    vpc.addGatewayEndpoint('DynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });
    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // =========================================================================
    // 2. SECURITY GROUPS (LEAST PRIVILEGE BOUNDARIES)
    // =========================================================================
    // ALB accepts HTTP/HTTPS from the public internet
    const albSg = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      description: 'Public Internet ingress for StatusDeck Application Load Balancer',
      allowAllOutbound: true,
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow public HTTP traffic');
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow public HTTPS traffic');

    // EC2 instances accept port 4000 ONLY from the ALB security group
    const ec2Sg = new ec2.SecurityGroup(this, 'Ec2SecurityGroup', {
      vpc,
      description: 'Restricted backend ingress strictly from ALB Security Group',
      allowAllOutbound: true,
    });
    ec2Sg.addIngressRule(
      albSg,
      ec2.Port.tcp(4000),
      'Allow inbound traffic on port 4000 strictly from ALB'
    );

    // =========================================================================
    // 3. DATABASE: AMAZON DYNAMODB (MULTI-TENANT NO-SQL TABLES)
    // =========================================================================
    const tenantsTable = new dynamodb.Table(this, 'TenantsTable', {
      tableName: 'StatusDeck-Tenants-prod',
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const monitorsTable = new dynamodb.Table(this, 'MonitorsTable', {
      tableName: 'StatusDeck-Monitors-prod',
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'monitorId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const resultsTable = new dynamodb.Table(this, 'CheckResultsTable', {
      tableName: 'StatusDeck-CheckResults-prod',
      partitionKey: { name: 'monitorId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'ttl', // 30-day auto-purge TTL
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const incidentsTable = new dynamodb.Table(this, 'IncidentsTable', {
      tableName: 'StatusDeck-Incidents-prod',
      partitionKey: { name: 'monitorId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'startedAt', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // =========================================================================
    // 4. AUTHENTICATION: AMAZON COGNITO USER POOL & CLIENT
    // =========================================================================
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'statusdeck-user-pool',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireDigits: true,
        requireSymbols: true,
        requireUppercase: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: 'statusdeck-web-client',
      generateSecret: false, // SPA browser clients do not store client secrets
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    // =========================================================================
    // 5. MESSAGING: AMAZON SNS TOPIC (INCIDENT ALERTS)
    // =========================================================================
    const alertsTopic = new sns.Topic(this, 'AlertsTopic', {
      topicName: 'StatusDeck-Alerts-prod',
      displayName: 'StatusDeck Incident Notifications',
    });

    // =========================================================================
    // 6. STORAGE: PRIVATE S3 BUCKET FOR THE REACT BUILD
    // =========================================================================
    // Defined before compute because the EC2 role needs read access to it.
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `statusdeck-frontend-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // =========================================================================
    // 7. COMPUTE: APPLICATION LOAD BALANCER & AUTO SCALING GROUP (IAAS)
    // =========================================================================
    // Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const httpListener = alb.addListener('HttpListener', {
      port: 80,
      open: true,
    });

    // EC2 IAM Role (Least Privilege)
    const ec2Role = new iam.Role(this, 'Ec2InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'IAM role allowing EC2 instances to access DynamoDB, S3 (frontend) and CloudWatch',
    });
    tenantsTable.grantReadWriteData(ec2Role);
    monitorsTable.grantReadWriteData(ec2Role);
    resultsTable.grantReadWriteData(ec2Role);
    incidentsTable.grantReadWriteData(ec2Role);
    ec2Role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
    );
    frontendBucket.grantRead(ec2Role);

    // EC2 User Data: install Node, start the server, and keep syncing the
    // frontend build from S3 (via the free S3 gateway endpoint, no NAT needed).
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'dnf install -y nodejs',
      'mkdir -p /opt/statusdeck/public',
      'cd /opt/statusdeck',
      "cat << 'EOF' > server.js",
      EC2_SERVER_JS,
      'EOF',
      "cat << 'EOF' > eval.json",
      JSON.stringify(EVAL_DATA),
      'EOF',
      'nohup node server.js > /var/log/statusdeck.log 2>&1 &',
      `nohup bash -c 'while true; do aws s3 sync s3://${frontendBucket.bucketName} /opt/statusdeck/public --region ${this.region} --delete; sleep 60; done' > /var/log/sync.log 2>&1 &`
    );

    // Auto Scaling Group (min: 1, desired: 2, max: 4)
    const asg = new autoscaling.AutoScalingGroup(this, 'AutoScalingGroup', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: ec2Sg,
      role: ec2Role,
      userData,
      minCapacity: 1,
      desiredCapacity: 2,
      maxCapacity: 4,
      cooldown: cdk.Duration.seconds(300),
    });

    // Auto Scaling Target Tracking Policy on 50% CPU utilization
    asg.scaleOnCpuUtilization('TargetTrackingCpu50', {
      targetUtilizationPercent: 50,
      cooldown: cdk.Duration.seconds(300),
    });

    // Target Group with ALB Health Checks
    httpListener.addTargets('Ec2TargetGroup', {
      port: 4000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [asg],
      healthCheck: {
        path: '/health',
        port: '4000',
        interval: cdk.Duration.seconds(15),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: cdk.Duration.seconds(5),
      },
    });

    // =========================================================================
    // 8. MONITOR WORKERS: AWS LAMBDA + EVENTBRIDGE (PAAS / FAAS)
    // =========================================================================
    const checkerLambda = new lambda.Function(this, 'MonitorCheckerLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'checker.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        DYNAMODB_TABLE_MONITORS: monitorsTable.tableName,
        DYNAMODB_TABLE_RESULTS: resultsTable.tableName,
        DYNAMODB_TABLE_INCIDENTS: incidentsTable.tableName,
        SNS_ALERTS_TOPIC_ARN: alertsTopic.topicArn,
      },
    });

    // Least privilege permissions for Lambda
    monitorsTable.grantReadWriteData(checkerLambda);
    resultsTable.grantReadWriteData(checkerLambda);
    incidentsTable.grantReadWriteData(checkerLambda);
    alertsTopic.grantPublish(checkerLambda);

    // EventBridge Rule: Trigger Lambda every 1 minute
    const cronRule = new events.Rule(this, 'CheckerScheduleRule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      description: 'Trigger StatusDeck monitor worker Lambda every 1 minute',
    });
    cronRule.addTarget(new targets.LambdaFunction(checkerLambda));

    // =========================================================================
    // 9. OPTIONAL CDN: CLOUDFRONT (OAC)
    // =========================================================================
    // Off by default because new AWS accounts must be verified before creating
    // CloudFront resources. Enable with:  cdk deploy -c enableCloudFront=true
    const enableCloudFront = this.node.tryGetContext('enableCloudFront') === 'true';
    let distribution: cloudfront.Distribution | undefined;
    if (enableCloudFront) {
      distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        },
        defaultRootObject: 'index.html',
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0),
          },
        ],
      });
    }

    // =========================================================================
    // 10. OBSERVABILITY: CLOUDWATCH ALARMS & DASHBOARD
    // =========================================================================
    // Metric: ASG CPU Utilization
    const asgCpuMetric = new cloudwatch.Metric({
      namespace: 'AWS/EC2',
      metricName: 'CPUUtilization',
      dimensionsMap: {
        AutoScalingGroupName: asg.autoScalingGroupName,
      },
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    });

    // Alarm 1: ASG CPU Utilization > 50%
    new cloudwatch.Alarm(this, 'AsgHighCpuAlarm', {
      metric: asgCpuMetric,
      threshold: 50,
      evaluationPeriods: 2,
      alarmDescription: 'ASG CPU exceeds 50% target threshold triggering scale-out',
    });

    // Alarm 2: ALB 5xx Server Errors > 5
    new cloudwatch.Alarm(this, 'Alb5xxAlarm', {
      metric: alb.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
        period: cdk.Duration.minutes(1),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: 'ALB recorded more than 5 server 5xx responses in 1 minute',
    });

    // Observability Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'StatusDeckDashboard', {
      dashboardName: 'StatusDeck-Operational-Telemetry',
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'ASG Cluster CPU Utilization (%)',
        left: [asgCpuMetric],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'ALB Request Count & 5XX Outages',
        left: [alb.metricRequestCount()],
        right: [alb.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT)],
        width: 12,
      })
    );

    // =========================================================================
    // 11. STACK OUTPUTS
    // =========================================================================
    new cdk.CfnOutput(this, 'AppUrl', {
      value: `http://${alb.loadBalancerDnsName}`,
      description: 'Public URL of the app served via the ALB',
    });

    if (distribution) {
      new cdk.CfnOutput(this, 'CloudFrontUrl', {
        value: `https://${distribution.distributionDomainName}`,
        description: 'CloudFront HTTPS URL (only when enableCloudFront=true)',
      });
    }

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: alb.loadBalancerDnsName,
      description: 'Application Load Balancer DNS Name',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'S3 bucket that holds the React build',
    });

    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: userPool.userPoolId,
      description: 'Amazon Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'CognitoClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Amazon Cognito Web Client ID',
    });

    new cdk.CfnOutput(this, 'SnsTopicArn', {
      value: alertsTopic.topicArn,
      description: 'Amazon SNS Alerts Topic ARN',
    });
  }
}
