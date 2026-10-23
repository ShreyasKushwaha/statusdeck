"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusDeckStack = void 0;
const cdk = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");
const autoscaling = require("aws-cdk-lib/aws-autoscaling");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const cognito = require("aws-cdk-lib/aws-cognito");
const lambda = require("aws-cdk-lib/aws-lambda");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const sns = require("aws-cdk-lib/aws-sns");
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const iam = require("aws-cdk-lib/aws-iam");
const path = require("path");
class StatusDeckStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        ec2Sg.addIngressRule(albSg, ec2.Port.tcp(4000), 'Allow inbound traffic on port 4000 strictly from ALB');
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
        // 6. COMPUTE: APPLICATION LOAD BALANCER & AUTO SCALING GROUP (IAAS)
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
            description: 'IAM role allowing EC2 instances to access DynamoDB and CloudWatch',
        });
        tenantsTable.grantReadWriteData(ec2Role);
        monitorsTable.grantReadWriteData(ec2Role);
        resultsTable.grantReadWriteData(ec2Role);
        incidentsTable.grantReadWriteData(ec2Role);
        ec2Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'));
        // EC2 User Data script to initialize the Node.js Express server
        const userData = ec2.UserData.forLinux();
        userData.addCommands('#!/bin/bash', 'echo "Starting StatusDeck EC2 initialization..."', 'dnf update -y', 'dnf install -y docker git nodejs npm', 'systemctl enable docker', 'systemctl start docker', 'mkdir -p /opt/statusdeck', 'cd /opt/statusdeck', 'cat << \'EOF\' > server.js', 'const http = require("http");', 'const server = http.createServer((req, res) => {', '  if (req.url === "/health" || req.url === "/api/v1/health") {', '    res.writeHead(200, { "Content-Type": "application/json" });', '    res.end(JSON.stringify({ status: "ok", service: "statusdeck-api", region: "ap-south-1" }));', '  } else {', '    res.writeHead(200, { "Content-Type": "application/json" });', '    res.end(JSON.stringify({ message: "StatusDeck API Gateway In-Service", time: new Date() }));', '  }', '});', 'server.listen(4000, () => console.log("StatusDeck API listening on port 4000"));', 'EOF', 'nohup node server.js > /var/log/statusdeck.log 2>&1 &');
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
        // 7. MONITOR WORKERS: AWS LAMBDA + EVENTBRIDGE (PAAS / FAAS)
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
        // 8. STORAGE & CDN: S3 (PRIVATE) + CLOUDFRONT (OAC)
        // =========================================================================
        const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
            bucketName: `statusdeck-frontend-${this.account}-${this.region}`,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });
        const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
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
        // =========================================================================
        // 9. OBSERVABILITY: CLOUDWATCH ALARMS & DASHBOARD
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
        const cpuAlarm = new cloudwatch.Alarm(this, 'AsgHighCpuAlarm', {
            metric: asgCpuMetric,
            threshold: 50,
            evaluationPeriods: 2,
            alarmDescription: 'ASG CPU exceeds 50% target threshold triggering scale-out',
        });
        // Alarm 2: ALB 5xx Server Errors > 5
        const alb5xxAlarm = new cloudwatch.Alarm(this, 'Alb5xxAlarm', {
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
        dashboard.addWidgets(new cloudwatch.GraphWidget({
            title: 'ASG Cluster CPU Utilization (%)',
            left: [asgCpuMetric],
            width: 12,
        }), new cloudwatch.GraphWidget({
            title: 'ALB Request Count & 5XX Outages',
            left: [alb.metricRequestCount()],
            right: [alb.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT)],
            width: 12,
        }));
        // =========================================================================
        // 10. STACK OUTPUTS
        // =========================================================================
        new cdk.CfnOutput(this, 'CloudFrontUrl', {
            value: `https://${distribution.distributionDomainName}`,
            description: 'Public CloudFront HTTPS URL for the StatusDeck React SPA',
        });
        new cdk.CfnOutput(this, 'AlbDnsName', {
            value: alb.loadBalancerDnsName,
            description: 'Application Load Balancer DNS Name',
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
exports.StatusDeckStack = StatusDeckStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdHVzZGVjay1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YXR1c2RlY2stc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBRW5DLDJDQUEyQztBQUMzQyxnRUFBZ0U7QUFDaEUsMkRBQTJEO0FBQzNELHFEQUFxRDtBQUNyRCxtREFBbUQ7QUFDbkQsaURBQWlEO0FBQ2pELGlEQUFpRDtBQUNqRCwwREFBMEQ7QUFDMUQsMkNBQTJDO0FBQzNDLHlDQUF5QztBQUN6Qyx5REFBeUQ7QUFDekQsOERBQThEO0FBQzlELHlEQUF5RDtBQUN6RCwyQ0FBMkM7QUFDM0MsNkJBQTZCO0FBRTdCLE1BQWEsZUFBZ0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUM1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDRFQUE0RTtRQUM1RSx3REFBd0Q7UUFDeEQsNEVBQTRFO1FBQzVFLGtGQUFrRjtRQUNsRixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM3QyxNQUFNLEVBQUUsQ0FBQztZQUNULFdBQVcsRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7WUFDaEQsV0FBVyxFQUFFLENBQUMsRUFBRSwwREFBMEQ7WUFDMUUsbUJBQW1CLEVBQUU7Z0JBQ25CO29CQUNFLFFBQVEsRUFBRSxFQUFFO29CQUNaLElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU07aUJBQ2xDO2dCQUNEO29CQUNFLFFBQVEsRUFBRSxFQUFFO29CQUNaLElBQUksRUFBRSxTQUFTO29CQUNmLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLG1CQUFtQjtpQkFDL0M7YUFDRjtTQUNG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QVU7WUFDMUIsV0FBVyxFQUFFLDZCQUE2QjtTQUMzQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ3pDLEtBQUssRUFBRSxjQUFjLENBQUMsZ0JBQWdCO1lBQ3RDLFdBQVcsRUFBRSw4QkFBOEI7U0FDNUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDckMsS0FBSyxFQUFFLFdBQVcsQ0FBQyxRQUFRO1lBQzNCLFdBQVcsRUFBRSw2QkFBNkI7U0FDM0MsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBalhELDBDQWlYQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGVsYnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lbGFzdGljbG9hZGJhbGFuY2luZ3YyJztcbmltcG9ydCAqIGFzIGF1dG9zY2FsaW5nIGZyb20gJ2F3cy1jZGstbGliL2F3cy1hdXRvc2NhbGluZyc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBldmVudHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cyc7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgY2xhc3MgU3RhdHVzRGVja1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDEuIE5FVFdPUktJTkc6IENVU1RPTSBWUEMgKE1VTFRJLUFaLCBOQVQtRlJFRSBERVNJR04pXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFNhdmVzIH4kMzIuNDAvbW9udGggYnkgb21pdHRpbmcgQVdTIE5BVCBHYXRld2F5IGFuZCB1c2luZyBWUEMgR2F0ZXdheSBFbmRwb2ludHNcbiAgICBjb25zdCB2cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCAnU3RhdHVzRGVja1ZwYycsIHtcbiAgICAgIG1heEF6czogMixcbiAgICAgIGlwQWRkcmVzc2VzOiBlYzIuSXBBZGRyZXNzZXMuY2lkcignMTAuMC4wLjAvMTYnKSxcbiAgICAgIG5hdEdhdGV3YXlzOiAwLCAvLyBaZXJvIE5BVCBHYXRld2F5cyBmb3IgbG93LWNvc3Qgc3R1ZGVudCBGcmVlIFRpZXIgZGVzaWduXG4gICAgICBzdWJuZXRDb25maWd1cmF0aW9uOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBjaWRyTWFzazogMjQsXG4gICAgICAgICAgbmFtZTogJ1B1YmxpYycsXG4gICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFVCTElDLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgY2lkck1hc2s6IDI0LFxuICAgICAgICAgIG5hbWU6ICdQcml2YXRlJyxcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFZQQyBHYXRld2F5IEVuZHBvaW50cyBmb3IgRHluYW1vREIgYW5kIFMzIChGcmVlICYga2VlcHMgdHJhZmZpYyB3aXRoaW4gQVdTIGJhY2tib25lKVxuICAgIHZwYy5hZGRHYXRld2F5RW5kcG9pbnQoJ0R5bmFtb0RiRW5kcG9pbnQnLCB7XG4gICAgICBzZXJ2aWNlOiBlYzIuR2F0ZXdheVZwY0VuZHBvaW50QXdzU2VydmljZS5EWU5BTU9EQixcbiAgICB9KTtcbiAgICB2cGMuYWRkR2F0ZXdheUVuZHBvaW50KCdTM0VuZHBvaW50Jywge1xuICAgICAgc2VydmljZTogZWMyLkdhdGV3YXlWcGNFbmRwb2ludEF3c1NlcnZpY2UuUzMsXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gMi4gU0VDVVJJVFkgR1JPVVBTIChMRUFTVCBQUklWSUxFR0UgQk9VTkRBUklFUylcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gQUxCIGFjY2VwdHMgSFRUUC9IVFRQUyBmcm9tIHRoZSBwdWJsaWMgaW50ZXJuZXRcbiAgICBjb25zdCBhbGJTZyA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnQWxiU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHVibGljIEludGVybmV0IGluZ3Jlc3MgZm9yIFN0YXR1c0RlY2sgQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlcicsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgIH0pO1xuICAgIGFsYlNnLmFkZEluZ3Jlc3NSdWxlKGVjMi5QZWVyLmFueUlwdjQoKSwgZWMyLlBvcnQudGNwKDgwKSwgJ0FsbG93IHB1YmxpYyBIVFRQIHRyYWZmaWMnKTtcbiAgICBhbGJTZy5hZGRJbmdyZXNzUnVsZShlYzIuUGVlci5hbnlJcHY0KCksIGVjMi5Qb3J0LnRjcCg0NDMpLCAnQWxsb3cgcHVibGljIEhUVFBTIHRyYWZmaWMnKTtcblxuICAgIC8vIEVDMiBpbnN0YW5jZXMgYWNjZXB0IHBvcnQgNDAwMCBPTkxZIGZyb20gdGhlIEFMQiBzZWN1cml0eSBncm91cFxuICAgIGNvbnN0IGVjMlNnID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdFYzJTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdSZXN0cmljdGVkIGJhY2tlbmQgaW5ncmVzcyBzdHJpY3RseSBmcm9tIEFMQiBTZWN1cml0eSBHcm91cCcsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgIH0pO1xuICAgIGVjMlNnLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgYWxiU2csXG4gICAgICBlYzIuUG9ydC50Y3AoNDAwMCksXG4gICAgICAnQWxsb3cgaW5ib3VuZCB0cmFmZmljIG9uIHBvcnQgNDAwMCBzdHJpY3RseSBmcm9tIEFMQidcbiAgICApO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDMuIERBVEFCQVNFOiBBTUFaT04gRFlOQU1PREIgKE1VTFRJLVRFTkFOVCBOTy1TUUwgVEFCTEVTKVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCB0ZW5hbnRzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1RlbmFudHNUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogJ1N0YXR1c0RlY2stVGVuYW50cy1wcm9kJyxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndGVuYW50SWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICBjb25zdCBtb25pdG9yc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdNb25pdG9yc1RhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiAnU3RhdHVzRGVjay1Nb25pdG9ycy1wcm9kJyxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndGVuYW50SWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAnbW9uaXRvcklkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzdWx0c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdDaGVja1Jlc3VsdHNUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogJ1N0YXR1c0RlY2stQ2hlY2tSZXN1bHRzLXByb2QnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdtb25pdG9ySWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAndGltZXN0YW1wJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHRpbWVUb0xpdmVBdHRyaWJ1dGU6ICd0dGwnLCAvLyAzMC1kYXkgYXV0by1wdXJnZSBUVExcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgY29uc3QgaW5jaWRlbnRzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0luY2lkZW50c1RhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiAnU3RhdHVzRGVjay1JbmNpZGVudHMtcHJvZCcsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ21vbml0b3JJZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdzdGFydGVkQXQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gNC4gQVVUSEVOVElDQVRJT046IEFNQVpPTiBDT0dOSVRPIFVTRVIgUE9PTCAmIENMSUVOVFxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdVc2VyUG9vbCcsIHtcbiAgICAgIHVzZXJQb29sTmFtZTogJ3N0YXR1c2RlY2stdXNlci1wb29sJyxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxuICAgICAgc2lnbkluQWxpYXNlczogeyBlbWFpbDogdHJ1ZSB9LFxuICAgICAgYXV0b1ZlcmlmeTogeyBlbWFpbDogdHJ1ZSB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudCh0aGlzLCAnVXNlclBvb2xDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbCxcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogJ3N0YXR1c2RlY2std2ViLWNsaWVudCcsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsIC8vIFNQQSBicm93c2VyIGNsaWVudHMgZG8gbm90IHN0b3JlIGNsaWVudCBzZWNyZXRzXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyA1LiBNRVNTQUdJTkc6IEFNQVpPTiBTTlMgVE9QSUMgKElOQ0lERU5UIEFMRVJUUylcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgYWxlcnRzVG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdBbGVydHNUb3BpYycsIHtcbiAgICAgIHRvcGljTmFtZTogJ1N0YXR1c0RlY2stQWxlcnRzLXByb2QnLFxuICAgICAgZGlzcGxheU5hbWU6ICdTdGF0dXNEZWNrIEluY2lkZW50IE5vdGlmaWNhdGlvbnMnLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDYuIENPTVBVVEU6IEFQUExJQ0FUSU9OIExPQUQgQkFMQU5DRVIgJiBBVVRPIFNDQUxJTkcgR1JPVVAgKElBQVMpXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEFwcGxpY2F0aW9uIExvYWQgQmFsYW5jZXJcbiAgICBjb25zdCBhbGIgPSBuZXcgZWxidjIuQXBwbGljYXRpb25Mb2FkQmFsYW5jZXIodGhpcywgJ0FMQicsIHtcbiAgICAgIHZwYyxcbiAgICAgIGludGVybmV0RmFjaW5nOiB0cnVlLFxuICAgICAgc2VjdXJpdHlHcm91cDogYWxiU2csXG4gICAgICB2cGNTdWJuZXRzOiB7IHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgaHR0cExpc3RlbmVyID0gYWxiLmFkZExpc3RlbmVyKCdIdHRwTGlzdGVuZXInLCB7XG4gICAgICBwb3J0OiA4MCxcbiAgICAgIG9wZW46IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBFQzIgSUFNIFJvbGUgKExlYXN0IFByaXZpbGVnZSlcbiAgICBjb25zdCBlYzJSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdFYzJJbnN0YW5jZVJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWMyLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgYWxsb3dpbmcgRUMyIGluc3RhbmNlcyB0byBhY2Nlc3MgRHluYW1vREIgYW5kIENsb3VkV2F0Y2gnLFxuICAgIH0pO1xuICAgIHRlbmFudHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoZWMyUm9sZSk7XG4gICAgbW9uaXRvcnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoZWMyUm9sZSk7XG4gICAgcmVzdWx0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShlYzJSb2xlKTtcbiAgICBpbmNpZGVudHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoZWMyUm9sZSk7XG4gICAgZWMyUm9sZS5hZGRNYW5hZ2VkUG9saWN5KFxuICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdDbG91ZFdhdGNoQWdlbnRTZXJ2ZXJQb2xpY3knKVxuICAgICk7XG5cbiAgICAvLyBFQzIgVXNlciBEYXRhIHNjcmlwdCB0byBpbml0aWFsaXplIHRoZSBOb2RlLmpzIEV4cHJlc3Mgc2VydmVyXG4gICAgY29uc3QgdXNlckRhdGEgPSBlYzIuVXNlckRhdGEuZm9yTGludXgoKTtcbiAgICB1c2VyRGF0YS5hZGRDb21tYW5kcyhcbiAgICAgICcjIS9iaW4vYmFzaCcsXG4gICAgICAnZWNobyBcIlN0YXJ0aW5nIFN0YXR1c0RlY2sgRUMyIGluaXRpYWxpemF0aW9uLi4uXCInLFxuICAgICAgJ2RuZiB1cGRhdGUgLXknLFxuICAgICAgJ2RuZiBpbnN0YWxsIC15IGRvY2tlciBnaXQgbm9kZWpzIG5wbScsXG4gICAgICAnc3lzdGVtY3RsIGVuYWJsZSBkb2NrZXInLFxuICAgICAgJ3N5c3RlbWN0bCBzdGFydCBkb2NrZXInLFxuICAgICAgJ21rZGlyIC1wIC9vcHQvc3RhdHVzZGVjaycsXG4gICAgICAnY2QgL29wdC9zdGF0dXNkZWNrJyxcbiAgICAgICdjYXQgPDwgXFwnRU9GXFwnID4gc2VydmVyLmpzJyxcbiAgICAgICdjb25zdCBodHRwID0gcmVxdWlyZShcImh0dHBcIik7JyxcbiAgICAgICdjb25zdCBzZXJ2ZXIgPSBodHRwLmNyZWF0ZVNlcnZlcigocmVxLCByZXMpID0+IHsnLFxuICAgICAgJyAgaWYgKHJlcS51cmwgPT09IFwiL2hlYWx0aFwiIHx8IHJlcS51cmwgPT09IFwiL2FwaS92MS9oZWFsdGhcIikgeycsXG4gICAgICAnICAgIHJlcy53cml0ZUhlYWQoMjAwLCB7IFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiIH0pOycsXG4gICAgICAnICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBzdGF0dXM6IFwib2tcIiwgc2VydmljZTogXCJzdGF0dXNkZWNrLWFwaVwiLCByZWdpb246IFwiYXAtc291dGgtMVwiIH0pKTsnLFxuICAgICAgJyAgfSBlbHNlIHsnLFxuICAgICAgJyAgICByZXMud3JpdGVIZWFkKDIwMCwgeyBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiB9KTsnLFxuICAgICAgJyAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogXCJTdGF0dXNEZWNrIEFQSSBHYXRld2F5IEluLVNlcnZpY2VcIiwgdGltZTogbmV3IERhdGUoKSB9KSk7JyxcbiAgICAgICcgIH0nLFxuICAgICAgJ30pOycsXG4gICAgICAnc2VydmVyLmxpc3Rlbig0MDAwLCAoKSA9PiBjb25zb2xlLmxvZyhcIlN0YXR1c0RlY2sgQVBJIGxpc3RlbmluZyBvbiBwb3J0IDQwMDBcIikpOycsXG4gICAgICAnRU9GJyxcbiAgICAgICdub2h1cCBub2RlIHNlcnZlci5qcyA+IC92YXIvbG9nL3N0YXR1c2RlY2subG9nIDI+JjEgJidcbiAgICApO1xuXG4gICAgLy8gQXV0byBTY2FsaW5nIEdyb3VwIChtaW46IDEsIGRlc2lyZWQ6IDIsIG1heDogNClcbiAgICBjb25zdCBhc2cgPSBuZXcgYXV0b3NjYWxpbmcuQXV0b1NjYWxpbmdHcm91cCh0aGlzLCAnQXV0b1NjYWxpbmdHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHsgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyB9LFxuICAgICAgaW5zdGFuY2VUeXBlOiBlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLlQzLCBlYzIuSW5zdGFuY2VTaXplLk1JQ1JPKSxcbiAgICAgIG1hY2hpbmVJbWFnZTogZWMyLk1hY2hpbmVJbWFnZS5sYXRlc3RBbWF6b25MaW51eDIwMjMoKSxcbiAgICAgIHNlY3VyaXR5R3JvdXA6IGVjMlNnLFxuICAgICAgcm9sZTogZWMyUm9sZSxcbiAgICAgIHVzZXJEYXRhLFxuICAgICAgbWluQ2FwYWNpdHk6IDEsXG4gICAgICBkZXNpcmVkQ2FwYWNpdHk6IDIsXG4gICAgICBtYXhDYXBhY2l0eTogNCxcbiAgICAgIGNvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMDApLFxuICAgIH0pO1xuXG4gICAgLy8gQXV0byBTY2FsaW5nIFRhcmdldCBUcmFja2luZyBQb2xpY3kgb24gNTAlIENQVSB1dGlsaXphdGlvblxuICAgIGFzZy5zY2FsZU9uQ3B1VXRpbGl6YXRpb24oJ1RhcmdldFRyYWNraW5nQ3B1NTAnLCB7XG4gICAgICB0YXJnZXRVdGlsaXphdGlvblBlcmNlbnQ6IDUwLFxuICAgICAgY29vbGRvd246IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwMCksXG4gICAgfSk7XG5cbiAgICAvLyBUYXJnZXQgR3JvdXAgd2l0aCBBTEIgSGVhbHRoIENoZWNrc1xuICAgIGh0dHBMaXN0ZW5lci5hZGRUYXJnZXRzKCdFYzJUYXJnZXRHcm91cCcsIHtcbiAgICAgIHBvcnQ6IDQwMDAsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICAgICAgdGFyZ2V0czogW2FzZ10sXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBwYXRoOiAnL2hlYWx0aCcsXG4gICAgICAgIHBvcnQ6ICc0MDAwJyxcbiAgICAgICAgaW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDE1KSxcbiAgICAgICAgaGVhbHRoeVRocmVzaG9sZENvdW50OiAyLFxuICAgICAgICB1bmhlYWx0aHlUaHJlc2hvbGRDb3VudDogMyxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDcuIE1PTklUT1IgV09SS0VSUzogQVdTIExBTUJEQSArIEVWRU5UQlJJREdFIChQQUFTIC8gRkFBUylcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgY2hlY2tlckxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ01vbml0b3JDaGVja2VyTGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiAnY2hlY2tlci5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhJykpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgRFlOQU1PREJfVEFCTEVfTU9OSVRPUlM6IG1vbml0b3JzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBEWU5BTU9EQl9UQUJMRV9SRVNVTFRTOiByZXN1bHRzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBEWU5BTU9EQl9UQUJMRV9JTkNJREVOVFM6IGluY2lkZW50c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgU05TX0FMRVJUU19UT1BJQ19BUk46IGFsZXJ0c1RvcGljLnRvcGljQXJuLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExlYXN0IHByaXZpbGVnZSBwZXJtaXNzaW9ucyBmb3IgTGFtYmRhXG4gICAgbW9uaXRvcnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoY2hlY2tlckxhbWJkYSk7XG4gICAgcmVzdWx0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShjaGVja2VyTGFtYmRhKTtcbiAgICBpbmNpZGVudHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoY2hlY2tlckxhbWJkYSk7XG4gICAgYWxlcnRzVG9waWMuZ3JhbnRQdWJsaXNoKGNoZWNrZXJMYW1iZGEpO1xuXG4gICAgLy8gRXZlbnRCcmlkZ2UgUnVsZTogVHJpZ2dlciBMYW1iZGEgZXZlcnkgMSBtaW51dGVcbiAgICBjb25zdCBjcm9uUnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnQ2hlY2tlclNjaGVkdWxlUnVsZScsIHtcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUucmF0ZShjZGsuRHVyYXRpb24ubWludXRlcygxKSksXG4gICAgICBkZXNjcmlwdGlvbjogJ1RyaWdnZXIgU3RhdHVzRGVjayBtb25pdG9yIHdvcmtlciBMYW1iZGEgZXZlcnkgMSBtaW51dGUnLFxuICAgIH0pO1xuICAgIGNyb25SdWxlLmFkZFRhcmdldChuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihjaGVja2VyTGFtYmRhKSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gOC4gU1RPUkFHRSAmIENETjogUzMgKFBSSVZBVEUpICsgQ0xPVURGUk9OVCAoT0FDKVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCBmcm9udGVuZEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0Zyb250ZW5kQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHN0YXR1c2RlY2stZnJvbnRlbmQtJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259YCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgfSk7XG5cbiAgICBjb25zdCBkaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgJ0Zyb250ZW5kRGlzdHJpYnV0aW9uJywge1xuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogb3JpZ2lucy5TM0J1Y2tldE9yaWdpbi53aXRoT3JpZ2luQWNjZXNzQ29udHJvbChmcm9udGVuZEJ1Y2tldCksXG4gICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19HRVRfSEVBRCxcbiAgICAgICAgY2FjaGVkTWV0aG9kczogY2xvdWRmcm9udC5DYWNoZWRNZXRob2RzLkNBQ0hFX0dFVF9IRUFELFxuICAgICAgfSxcbiAgICAgIGRlZmF1bHRSb290T2JqZWN0OiAnaW5kZXguaHRtbCcsXG4gICAgICBlcnJvclJlc3BvbnNlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaHR0cFN0YXR1czogNDAzLFxuICAgICAgICAgIHJlc3BvbnNlSHR0cFN0YXR1czogMjAwLFxuICAgICAgICAgIHJlc3BvbnNlUGFnZVBhdGg6ICcvaW5kZXguaHRtbCcsXG4gICAgICAgICAgdHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwNCxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDkuIE9CU0VSVkFCSUxJVFk6IENMT1VEV0FUQ0ggQUxBUk1TICYgREFTSEJPQVJEXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIE1ldHJpYzogQVNHIENQVSBVdGlsaXphdGlvblxuICAgIGNvbnN0IGFzZ0NwdU1ldHJpYyA9IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICBuYW1lc3BhY2U6ICdBV1MvRUMyJyxcbiAgICAgIG1ldHJpY05hbWU6ICdDUFVVdGlsaXphdGlvbicsXG4gICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgIEF1dG9TY2FsaW5nR3JvdXBOYW1lOiBhc2cuYXV0b1NjYWxpbmdHcm91cE5hbWUsXG4gICAgICB9LFxuICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXG4gICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgIH0pO1xuXG4gICAgLy8gQWxhcm0gMTogQVNHIENQVSBVdGlsaXphdGlvbiA+IDUwJVxuICAgIGNvbnN0IGNwdUFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0FzZ0hpZ2hDcHVBbGFybScsIHtcbiAgICAgIG1ldHJpYzogYXNnQ3B1TWV0cmljLFxuICAgICAgdGhyZXNob2xkOiA1MCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FTRyBDUFUgZXhjZWVkcyA1MCUgdGFyZ2V0IHRocmVzaG9sZCB0cmlnZ2VyaW5nIHNjYWxlLW91dCcsXG4gICAgfSk7XG5cbiAgICAvLyBBbGFybSAyOiBBTEIgNXh4IFNlcnZlciBFcnJvcnMgPiA1XG4gICAgY29uc3QgYWxiNXh4QWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQWxiNXh4QWxhcm0nLCB7XG4gICAgICBtZXRyaWM6IGFsYi5tZXRyaWNIdHRwQ29kZVRhcmdldChlbGJ2Mi5IdHRwQ29kZVRhcmdldC5UQVJHRVRfNVhYX0NPVU5ULCB7XG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogNSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FMQiByZWNvcmRlZCBtb3JlIHRoYW4gNSBzZXJ2ZXIgNXh4IHJlc3BvbnNlcyBpbiAxIG1pbnV0ZScsXG4gICAgfSk7XG5cbiAgICAvLyBPYnNlcnZhYmlsaXR5IERhc2hib2FyZFxuICAgIGNvbnN0IGRhc2hib2FyZCA9IG5ldyBjbG91ZHdhdGNoLkRhc2hib2FyZCh0aGlzLCAnU3RhdHVzRGVja0Rhc2hib2FyZCcsIHtcbiAgICAgIGRhc2hib2FyZE5hbWU6ICdTdGF0dXNEZWNrLU9wZXJhdGlvbmFsLVRlbGVtZXRyeScsXG4gICAgfSk7XG5cbiAgICBkYXNoYm9hcmQuYWRkV2lkZ2V0cyhcbiAgICAgIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgICAgdGl0bGU6ICdBU0cgQ2x1c3RlciBDUFUgVXRpbGl6YXRpb24gKCUpJyxcbiAgICAgICAgbGVmdDogW2FzZ0NwdU1ldHJpY10sXG4gICAgICAgIHdpZHRoOiAxMixcbiAgICAgIH0pLFxuICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgICB0aXRsZTogJ0FMQiBSZXF1ZXN0IENvdW50ICYgNVhYIE91dGFnZXMnLFxuICAgICAgICBsZWZ0OiBbYWxiLm1ldHJpY1JlcXVlc3RDb3VudCgpXSxcbiAgICAgICAgcmlnaHQ6IFthbGIubWV0cmljSHR0cENvZGVUYXJnZXQoZWxidjIuSHR0cENvZGVUYXJnZXQuVEFSR0VUXzVYWF9DT1VOVCldLFxuICAgICAgICB3aWR0aDogMTIsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gMTAuIFNUQUNLIE9VVFBVVFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Nsb3VkRnJvbnRVcmwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHtkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246ICdQdWJsaWMgQ2xvdWRGcm9udCBIVFRQUyBVUkwgZm9yIHRoZSBTdGF0dXNEZWNrIFJlYWN0IFNQQScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQWxiRG5zTmFtZScsIHtcbiAgICAgIHZhbHVlOiBhbGIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlciBETlMgTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQW1hem9uIENvZ25pdG8gVXNlciBQb29sIElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb2duaXRvQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQW1hem9uIENvZ25pdG8gV2ViIENsaWVudCBJRCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU25zVG9waWNBcm4nLCB7XG4gICAgICB2YWx1ZTogYWxlcnRzVG9waWMudG9waWNBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0FtYXpvbiBTTlMgQWxlcnRzIFRvcGljIEFSTicsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==