import { describe, it, expect, beforeEach } from 'vitest';
import { processMonitorCheck, ProbeOutcome } from '../src/workers/monitorChecker';
import { db, inMemoryDb, MonitorRecord } from '../src/db/dynamo';

describe('Monitor Checker & Incident Debounce State Machine', () => {
  const testMonitor: MonitorRecord = {
    tenantId: 'test-tenant',
    monitorId: 'mon-test-debounce',
    name: 'Debounce State Machine Target',
    url: 'https://api.test.internal/health',
    method: 'GET',
    expectedStatus: 200,
    intervalSec: 60,
    timeoutMs: 3000,
    state: 'up',
    alertEmail: 'test@ops.internal',
    consecutiveFailures: 0,
    avgLatencyMs: 50,
    uptimePct90d: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    inMemoryDb.incidents.delete(testMonitor.monitorId);
    inMemoryDb.results.delete(testMonitor.monitorId);
    await db.putMonitor({ ...testMonitor });
  });

  it('1st failure marks state as DEGRADED without triggering down outage incident (Debounce)', async () => {
    const failOutcome: ProbeOutcome = {
      monitorId: testMonitor.monitorId,
      statusCode: 500,
      latencyMs: 120,
      ok: false,
      error: 'HTTP 500 Internal Server Error',
    };

    const updated = await processMonitorCheck(testMonitor, failOutcome, false);

    expect(updated.state).toBe('degraded');
    expect(updated.consecutiveFailures).toBe(1);

    const incidents = await db.getIncidentsByMonitor(testMonitor.monitorId);
    expect(incidents.length).toBe(0); // Debounced! No incident created on first transient glitch
  });

  it('2nd consecutive failure transitions state to DOWN and creates active incident', async () => {
    const degradedMonitor: MonitorRecord = {
      ...testMonitor,
      state: 'degraded',
      consecutiveFailures: 1,
    };

    const secondFailOutcome: ProbeOutcome = {
      monitorId: testMonitor.monitorId,
      statusCode: 503,
      latencyMs: 250,
      ok: false,
      error: 'HTTP 503 Service Unavailable',
    };

    const updated = await processMonitorCheck(degradedMonitor, secondFailOutcome, false);

    expect(updated.state).toBe('down');
    expect(updated.consecutiveFailures).toBe(2);

    const incidents = await db.getIncidentsByMonitor(testMonitor.monitorId);
    expect(incidents.length).toBe(1);
    expect(incidents[0].status).toBe('ongoing');
    expect(incidents[0].cause).toContain('503');
  });

  it('Successful check after outage recovers state to UP and resolves active incident', async () => {
    const downMonitor: MonitorRecord = {
      ...testMonitor,
      state: 'down',
      consecutiveFailures: 2,
    };

    // Seed ongoing incident
    await db.addIncident({
      monitorId: testMonitor.monitorId,
      startedAt: new Date(Date.now() - 300000).toISOString(), // 5 min ago
      cause: 'HTTP 503 Service Unavailable',
      tenantId: 'test-tenant',
      status: 'ongoing',
    });

    const successOutcome: ProbeOutcome = {
      monitorId: testMonitor.monitorId,
      statusCode: 200,
      latencyMs: 45,
      ok: true,
    };

    const updated = await processMonitorCheck(downMonitor, successOutcome, false);

    expect(updated.state).toBe('up');
    expect(updated.consecutiveFailures).toBe(0);

    const incidents = await db.getIncidentsByMonitor(testMonitor.monitorId);
    expect(incidents.length).toBe(1);
    expect(incidents[0].status).toBe('resolved');
    expect(incidents[0].endedAt).toBeDefined();
    expect(incidents[0].durationSeconds).toBeGreaterThan(0);
  });

  it('Writes CheckResult with 30-day DynamoDB TTL epoch timestamp', async () => {
    const successOutcome: ProbeOutcome = {
      monitorId: testMonitor.monitorId,
      statusCode: 200,
      latencyMs: 38,
      ok: true,
    };

    await processMonitorCheck(testMonitor, successOutcome, false);

    const results = await db.getResults(testMonitor.monitorId);
    expect(results.length).toBeGreaterThan(0);
    const latest = results[results.length - 1];
    expect(latest.ok).toBe(true);

    const nowEpoch = Math.floor(Date.now() / 1000);
    // TTL should be roughly 30 days from now (+/- 60 seconds)
    expect(latest.ttl).toBeGreaterThan(nowEpoch + 29 * 86400);
  });
});
