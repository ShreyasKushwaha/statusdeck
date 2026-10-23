import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const region = process.env.AWS_REGION || 'ap-south-1';
const monitorsTable = process.env.DYNAMODB_TABLE_MONITORS || 'StatusDeck-Monitors-dev';
const resultsTable = process.env.DYNAMODB_TABLE_RESULTS || 'StatusDeck-CheckResults-dev';
const incidentsTable = process.env.DYNAMODB_TABLE_INCIDENTS || 'StatusDeck-Incidents-dev';
const snsTopicArn = process.env.SNS_ALERTS_TOPIC_ARN;

const ddbClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const snsClient = new SNSClient({ region });

export interface MonitorItem {
  tenantId: string;
  monitorId: string;
  name: string;
  url: string;
  method: string;
  expectedStatus: number;
  intervalSec: number;
  timeoutMs: number;
  state: 'up' | 'degraded' | 'down';
  consecutiveFailures?: number;
  avgLatencyMs?: number;
  alertEmail?: string;
}

export const handler = async (event: unknown): Promise<{ statusCode: number; checkedCount: number }> => {
  console.log('[LAMBDA CHECKER] Triggered by EventBridge schedule:', JSON.stringify(event));

  // Scan monitors to check
  const scanOutput = await docClient.send(
    new ScanCommand({
      TableName: monitorsTable,
    })
  );

  const monitors = (scanOutput.Items as MonitorItem[]) || [];
  console.log(`[LAMBDA CHECKER] Found ${monitors.length} total monitors.`);

  let checkedCount = 0;

  for (const monitor of monitors) {
    checkedCount++;
    const startTime = performance.now();
    let isOk = false;
    let statusCode = 0;
    let errorMessage: string | undefined;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), monitor.timeoutMs || 5000);

    try {
      const res = await fetch(monitor.url, {
        method: monitor.method || 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'StatusDeck-LambdaWorker/1.0',
        },
      });
      clearTimeout(timeout);
      statusCode = res.status;
      isOk = statusCode === (monitor.expectedStatus || 200);
      if (!isOk) {
        errorMessage = `Expected HTTP ${monitor.expectedStatus}, received HTTP ${statusCode}`;
      }
    } catch (err: unknown) {
      clearTimeout(timeout);
      const msg = err instanceof Error ? err.message : 'Unknown network failure';
      statusCode = msg.includes('abort') ? 504 : 502;
      isOk = false;
      errorMessage = msg;
    }

    const latencyMs = Math.round(performance.now() - startTime);
    const nowIso = new Date().toISOString();
    const ttlEpoch = Math.floor(Date.now() / 1000) + 30 * 86400; // 30 days

    // 1. Write CheckResult to DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: resultsTable,
        Item: {
          monitorId: monitor.monitorId,
          timestamp: nowIso,
          statusCode,
          latencyMs,
          ok: isOk,
          ttl: ttlEpoch,
        },
      })
    );

    // 2. Debounce State Machine (2 failures)
    let consecutiveFailures = monitor.consecutiveFailures || 0;
    let nextState: 'up' | 'degraded' | 'down' = monitor.state || 'up';

    if (!isOk) {
      consecutiveFailures += 1;
      if (consecutiveFailures === 1) {
        nextState = 'degraded';
      } else if (consecutiveFailures >= 2) {
        const wasDown = monitor.state === 'down';
        nextState = 'down';

        if (!wasDown) {
          // Create incident record
          await docClient.send(
            new PutCommand({
              TableName: incidentsTable,
              Item: {
                monitorId: monitor.monitorId,
                startedAt: nowIso,
                cause: errorMessage || `HTTP ${statusCode} failure`,
                tenantId: monitor.tenantId,
                status: 'ongoing',
              },
            })
          );

          // Publish SNS Outage Alert
          if (snsTopicArn) {
            await snsClient.send(
              new PublishCommand({
                TopicArn: snsTopicArn,
                Subject: `[STATUSDECK OUTAGE] ${monitor.name} is DOWN`,
                Message: `Monitor '${monitor.name}' failed 2 consecutive checks.\nTarget: ${monitor.url}\nError: ${errorMessage}\nTimestamp: ${nowIso}`,
              })
            );
          }
        }
      }
    } else {
      const wasDown = monitor.state === 'down';
      consecutiveFailures = 0;
      nextState = 'up';

      if (wasDown) {
        // Resolve incident
        if (snsTopicArn) {
          await snsClient.send(
            new PublishCommand({
              TopicArn: snsTopicArn,
              Subject: `[STATUSDECK RECOVERY] ${monitor.name} is UP`,
              Message: `Monitor '${monitor.name}' has recovered.\nTarget: ${monitor.url}\nStatus: HTTP ${statusCode}\nTimestamp: ${nowIso}`,
            })
          );
        }
      }
    }

    // 3. Update monitor record
    await docClient.send(
      new UpdateCommand({
        TableName: monitorsTable,
        Key: {
          tenantId: monitor.tenantId,
          monitorId: monitor.monitorId,
        },
        UpdateExpression:
          'SET #state = :state, consecutiveFailures = :cf, lastCheckedAt = :lca, avgLatencyMs = :lat, updatedAt = :ua',
        ExpressionAttributeNames: {
          '#state': 'state',
        },
        ExpressionAttributeValues: {
          ':state': nextState,
          ':cf': consecutiveFailures,
          ':lca': nowIso,
          ':lat': latencyMs,
          ':ua': nowIso,
        },
      })
    );
  }

  return { statusCode: 200, checkedCount };
};
