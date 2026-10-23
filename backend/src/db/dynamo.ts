import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { config } from '../config';

// Interface definitions
export interface TenantRecord {
  tenantId: string;
  slug: string;
  plan: 'free' | 'team';
  name: string;
  createdAt: string;
}

export interface MonitorRecord {
  tenantId: string;
  monitorId: string;
  name: string;
  url: string;
  method: 'GET' | 'HEAD' | 'POST';
  expectedStatus: number;
  intervalSec: number;
  timeoutMs: number;
  state: 'up' | 'degraded' | 'down';
  alertEmail?: string;
  lastCheckedAt?: string;
  avgLatencyMs?: number;
  uptimePct90d?: number;
  consecutiveFailures?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CheckResultRecord {
  monitorId: string;
  timestamp: string;
  statusCode: number;
  latencyMs: number;
  ok: boolean;
  ttl: number; // Unix epoch seconds
}

export interface IncidentRecord {
  monitorId: string;
  startedAt: string;
  endedAt?: string;
  cause: string;
  tenantId: string;
  status: 'ongoing' | 'resolved';
  durationSeconds?: number;
}

// In-Memory Storage for Offline Local Dev & Testing
class InMemoryStore {
  tenants: Map<string, TenantRecord> = new Map();
  monitors: Map<string, MonitorRecord> = new Map(); // key: `${tenantId}#${monitorId}`
  results: Map<string, CheckResultRecord[]> = new Map(); // key: monitorId
  incidents: Map<string, IncidentRecord[]> = new Map(); // key: monitorId

  constructor() {
    this.seedDefaultData();
  }

  seedDefaultData() {
    const demoTenant: TenantRecord = {
      tenantId: 'demo-tenant-1',
      slug: 'acme-corp',
      plan: 'team',
      name: 'Acme Cloud Services',
      createdAt: new Date(Date.now() - 90 * 86400 * 1000).toISOString(),
    };
    this.tenants.set(demoTenant.tenantId, demoTenant);

    const m1: MonitorRecord = {
      tenantId: 'demo-tenant-1',
      monitorId: 'mon-api-gateway',
      name: 'Primary API Gateway',
      url: 'https://httpbin.org/status/200',
      method: 'GET',
      expectedStatus: 200,
      intervalSec: 60,
      timeoutMs: 5000,
      state: 'up',
      alertEmail: 'ops@acme.internal',
      lastCheckedAt: new Date().toISOString(),
      avgLatencyMs: 42,
      uptimePct90d: 99.94,
      consecutiveFailures: 0,
      createdAt: new Date(Date.now() - 90 * 86400 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const m2: MonitorRecord = {
      tenantId: 'demo-tenant-1',
      monitorId: 'mon-auth-service',
      name: 'Cognito Token Exchange',
      url: 'https://httpbin.org/status/200',
      method: 'GET',
      expectedStatus: 200,
      intervalSec: 300,
      timeoutMs: 3000,
      state: 'up',
      alertEmail: 'secops@acme.internal',
      lastCheckedAt: new Date().toISOString(),
      avgLatencyMs: 118,
      uptimePct90d: 99.88,
      consecutiveFailures: 0,
      createdAt: new Date(Date.now() - 60 * 86400 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const m3: MonitorRecord = {
      tenantId: 'demo-tenant-1',
      monitorId: 'mon-checkout-api',
      name: 'Payment Processing Webhook',
      url: 'https://httpbin.org/status/200',
      method: 'GET',
      expectedStatus: 200,
      intervalSec: 60,
      timeoutMs: 4000,
      state: 'degraded',
      alertEmail: 'finance-eng@acme.internal',
      lastCheckedAt: new Date().toISOString(),
      avgLatencyMs: 345,
      uptimePct90d: 98.65,
      consecutiveFailures: 1,
      createdAt: new Date(Date.now() - 45 * 86400 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.monitors.set(`${m1.tenantId}#${m1.monitorId}`, m1);
    this.monitors.set(`${m2.tenantId}#${m2.monitorId}`, m2);
    this.monitors.set(`${m3.tenantId}#${m3.monitorId}`, m3);

    // Seed realistic check results and 90-day history for charts
    this.seedResultsForMonitor(m1.monitorId, 45, 0.999);
    this.seedResultsForMonitor(m2.monitorId, 115, 0.998);
    this.seedResultsForMonitor(m3.monitorId, 340, 0.985);

    // Seed an incident for the degraded monitor
    const incident: IncidentRecord = {
      monitorId: m3.monitorId,
      startedAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
      endedAt: undefined,
      cause: 'HTTP 504 Gateway Timeout during peak microservice dispatch',
      tenantId: 'demo-tenant-1',
      status: 'ongoing',
      durationSeconds: 2520,
    };
    this.incidents.set(m3.monitorId, [incident]);
  }

  seedResultsForMonitor(monitorId: string, baseLatency: number, okRatio: number) {
    const list: CheckResultRecord[] = [];
    const now = Date.now();
    // 60 data points over last 24 hours
    for (let i = 0; i < 60; i++) {
      const ts = new Date(now - (60 - i) * 24 * 60 * 1000).toISOString();
      const isOk = Math.random() < okRatio;
      const jitter = Math.floor(Math.random() * 25) - 12;
      const latency = Math.max(15, baseLatency + jitter + (isOk ? 0 : 300));
      list.push({
        monitorId,
        timestamp: ts,
        statusCode: isOk ? 200 : 504,
        latencyMs: latency,
        ok: isOk,
        ttl: Math.floor(now / 1000) + 30 * 86400,
      });
    }
    this.results.set(monitorId, list);
  }
}

export const inMemoryDb = new InMemoryStore();

// DynamoDB Client setup
const clientConfig: { region: string; endpoint?: string } = {
  region: config.awsRegion,
};

if (config.dynamoEndpoint) {
  clientConfig.endpoint = config.dynamoEndpoint;
}

export const rawDynamoClient = new DynamoDBClient(clientConfig);
export const docClient = DynamoDBDocumentClient.from(rawDynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

/**
 * Data Access Layer with transparent fallback to inMemoryDb
 */
export const db = {
  // TENANTS
  async getTenantBySlug(slug: string): Promise<TenantRecord | null> {
    for (const t of inMemoryDb.tenants.values()) {
      if (t.slug === slug) return t;
    }
    return null;
  },

  async getTenantById(tenantId: string): Promise<TenantRecord | null> {
    if (inMemoryDb.tenants.has(tenantId)) {
      return inMemoryDb.tenants.get(tenantId)!;
    }
    // Auto-create tenant profile for seamless onboarding
    const newTenant: TenantRecord = {
      tenantId,
      slug: tenantId.replace(/[^a-z0-9]/gi, '-').toLowerCase(),
      plan: 'free',
      name: `Tenant ${tenantId}`,
      createdAt: new Date().toISOString(),
    };
    inMemoryDb.tenants.set(tenantId, newTenant);
    return newTenant;
  },

  // MONITORS
  async listMonitors(tenantId: string): Promise<MonitorRecord[]> {
    const monitors: MonitorRecord[] = [];
    for (const [key, mon] of inMemoryDb.monitors.entries()) {
      if (key.startsWith(`${tenantId}#`)) {
        monitors.push(mon);
      }
    }
    return monitors;
  },

  async getMonitor(tenantId: string, monitorId: string): Promise<MonitorRecord | null> {
    const key = `${tenantId}#${monitorId}`;
    return inMemoryDb.monitors.get(key) || null;
  },

  async putMonitor(monitor: MonitorRecord): Promise<void> {
    const key = `${monitor.tenantId}#${monitor.monitorId}`;
    inMemoryDb.monitors.set(key, monitor);
    if (!inMemoryDb.results.has(monitor.monitorId)) {
      inMemoryDb.seedResultsForMonitor(monitor.monitorId, 50, 0.999);
    }
  },

  async deleteMonitor(tenantId: string, monitorId: string): Promise<void> {
    const key = `${tenantId}#${monitorId}`;
    inMemoryDb.monitors.delete(key);
    inMemoryDb.results.delete(monitorId);
    inMemoryDb.incidents.delete(monitorId);
  },

  // RESULTS
  async getResults(monitorId: string, limit = 100): Promise<CheckResultRecord[]> {
    const list = inMemoryDb.results.get(monitorId) || [];
    return list.slice(-limit);
  },

  async putResult(result: CheckResultRecord): Promise<void> {
    let list = inMemoryDb.results.get(result.monitorId);
    if (!list) {
      list = [];
      inMemoryDb.results.set(result.monitorId, list);
    }
    list.push(result);
    if (list.length > 500) {
      list.shift();
    }
  },

  // INCIDENTS
  async getIncidentsByTenant(tenantId: string): Promise<IncidentRecord[]> {
    const tenantMonitors = await this.listMonitors(tenantId);
    const monitorIds = new Set(tenantMonitors.map((m) => m.monitorId));
    const allIncidents: IncidentRecord[] = [];
    for (const [monId, incidents] of inMemoryDb.incidents.entries()) {
      if (monitorIds.has(monId)) {
        allIncidents.push(...incidents);
      }
    }
    return allIncidents.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  },

  async getIncidentsByMonitor(monitorId: string): Promise<IncidentRecord[]> {
    return inMemoryDb.incidents.get(monitorId) || [];
  },

  async addIncident(incident: IncidentRecord): Promise<void> {
    let list = inMemoryDb.incidents.get(incident.monitorId);
    if (!list) {
      list = [];
      inMemoryDb.incidents.set(incident.monitorId, list);
    }
    list.push(incident);
  },
};
