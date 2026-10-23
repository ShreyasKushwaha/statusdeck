import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { db, MonitorRecord, CheckResultRecord, IncidentRecord } from '../db/dynamo';
import { config } from '../config';

const snsClient = new SNSClient({ region: config.awsRegion });

export interface ProbeOutcome {
  monitorId: string;
  statusCode: number;
  latencyMs: number;
  ok: boolean;
  error?: string;
}

/**
 * Executes an HTTP/HTTPS health probe against a target monitor URL.
 */
export async function executeHttpProbe(monitor: MonitorRecord): Promise<ProbeOutcome> {
  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), monitor.timeoutMs || 5000);

  try {
    const res = await fetch(monitor.url, {
      method: monitor.method || 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'StatusDeck-Probe/1.0 (+https://statusdeck.internal)',
      },
    });

    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - startTime);
    const isOk = res.status === (monitor.expectedStatus || 200);

    return {
      monitorId: monitor.monitorId,
      statusCode: res.status,
      latencyMs,
      ok: isOk,
      error: isOk ? undefined : `Expected HTTP ${monitor.expectedStatus}, received HTTP ${res.status}`,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - startTime);
    const errorMsg = err instanceof Error ? err.message : 'Unknown network failure';

    return {
      monitorId: monitor.monitorId,
      statusCode: errorMsg.includes('abort') ? 504 : 502,
      latencyMs,
      ok: false,
      error: errorMsg.includes('abort') ? `Probe timed out after ${monitor.timeoutMs}ms` : errorMsg,
    };
  }
}

/**
 * Processes probe outcome, applies the 2-failure debounce state machine,
 * records CheckResult with 30-day TTL, updates incidents, and sends SNS notifications.
 */
export async function processMonitorCheck(
  monitor: MonitorRecord,
  outcome: ProbeOutcome,
  publishSns = true
): Promise<MonitorRecord> {
  const now = new Date();
  const nowIso = now.toISOString();
  const ttlEpochSeconds = Math.floor(now.getTime() / 1000) + 30 * 24 * 60 * 60; // 30 Days TTL

  // 1. Record CheckResult
  const checkResult: CheckResultRecord = {
    monitorId: monitor.monitorId,
    timestamp: nowIso,
    statusCode: outcome.statusCode,
    latencyMs: outcome.latencyMs,
    ok: outcome.ok,
    ttl: ttlEpochSeconds,
  };
  await db.putResult(checkResult);

  // 2. State Machine & Debounce
  let nextState: 'up' | 'degraded' | 'down' = monitor.state;
  let consecutiveFailures = monitor.consecutiveFailures || 0;

  if (!outcome.ok) {
    consecutiveFailures += 1;

    if (consecutiveFailures === 1) {
      // First failure: mark degraded, do not trigger SNS outage alert yet (Debounce 1)
      nextState = 'degraded';
    } else if (consecutiveFailures >= 2) {
      // Two consecutive failures: transition to DOWN and trigger incident / SNS
      const wasDown = monitor.state === 'down';
      nextState = 'down';

      if (!wasDown) {
        // Create new incident
        const newIncident: IncidentRecord = {
          monitorId: monitor.monitorId,
          startedAt: nowIso,
          cause: outcome.error || `HTTP ${outcome.statusCode} failure`,
          tenantId: monitor.tenantId,
          status: 'ongoing',
        };
        await db.addIncident(newIncident);

        // Dispatch SNS Alert
        if (publishSns && (config.sns.alertsTopicArn || monitor.alertEmail)) {
          await sendSnsAlert({
            monitor,
            subject: `[ALERT: DOWN] ${monitor.name} is unreachable`,
            message: `StatusDeck Monitor Alert:\n\nService: ${monitor.name}\nTarget: ${monitor.url}\nObserved Failure: ${outcome.error}\nLatency: ${outcome.latencyMs}ms\nTimestamp: ${nowIso}\nTenant: ${monitor.tenantId}\n\nDebounce threshold (2 consecutive failures) reached.`,
          });
        }
      }
    }
  } else {
    // Probe succeeded
    const wasDown = monitor.state === 'down';
    consecutiveFailures = 0;
    nextState = 'up';

    if (wasDown) {
      // Resolve ongoing incidents
      const incidents = await db.getIncidentsByMonitor(monitor.monitorId);
      const activeIncident = incidents.find((i) => i.status === 'ongoing');
      if (activeIncident) {
        activeIncident.endedAt = nowIso;
        activeIncident.status = 'resolved';
        const startMs = new Date(activeIncident.startedAt).getTime();
        activeIncident.durationSeconds = Math.round((now.getTime() - startMs) / 1000);
      }

      // Dispatch SNS Recovery Alert
      if (publishSns && (config.sns.alertsTopicArn || monitor.alertEmail)) {
        await sendSnsAlert({
          monitor,
          subject: `[RECOVERED] ${monitor.name} is back operational`,
          message: `StatusDeck Monitor Recovery:\n\nService: ${monitor.name}\nTarget: ${monitor.url}\nStatus: HTTP ${outcome.statusCode}\nLatency: ${outcome.latencyMs}ms\nTimestamp: ${nowIso}\nTenant: ${monitor.tenantId}\n\nService health has been verified operational.`,
        });
      }
    }
  }

  // 3. Compute rolling average latency
  const currentAvg = monitor.avgLatencyMs || outcome.latencyMs;
  const newAvgLatency = Math.round((currentAvg * 9 + outcome.latencyMs) / 10);

  const updatedMonitor: MonitorRecord = {
    ...monitor,
    state: nextState,
    consecutiveFailures,
    lastCheckedAt: nowIso,
    avgLatencyMs: newAvgLatency,
    updatedAt: nowIso,
  };

  await db.putMonitor(updatedMonitor);
  return updatedMonitor;
}

/**
 * Publishes alert messages via Amazon SNS topic or logged in development
 */
async function sendSnsAlert({
  subject,
  message,
}: {
  monitor: MonitorRecord;
  subject: string;
  message: string;
}): Promise<void> {
  if (config.sns.alertsTopicArn) {
    try {
      await snsClient.send(
        new PublishCommand({
          TopicArn: config.sns.alertsTopicArn,
          Subject: subject,
          Message: message,
        })
      );
      console.log(`[SNS] Published notification: ${subject}`);
    } catch (err) {
      console.error('[SNS] Failed to publish notification to SNS topic:', err);
    }
  } else {
    // Development / mock logging
    console.log(`[SNS DEV] ${subject}\n${message}`);
  }
}
