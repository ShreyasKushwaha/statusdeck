import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/index';

describe('StatusDeck REST API Suite', () => {
  describe('Health Endpoints (ALB Probes)', () => {
    it('GET /health returns 200 with request ID and system status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('statusdeck-api');
      expect(res.body.requestId).toBeDefined();
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('GET /api/v1/health mirrors the root health check', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('Authentication & Multi-Tenant Scoping', () => {
    it('rejects unauthenticated requests to /api/v1/monitors with 401', async () => {
      const res = await request(app).get('/api/v1/monitors');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('rejects malformed authorization header', async () => {
      const res = await request(app)
        .get('/api/v1/monitors')
        .set('Authorization', 'Basic user:pass');
      expect(res.status).toBe(401);
    });

    it('authenticates valid dev bearer token and returns monitors for tenant', async () => {
      const res = await request(app)
        .get('/api/v1/monitors')
        .set('Authorization', 'Bearer dev-tenant-demo-tenant-1');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.monitors)).toBe(true);
      expect(res.body.monitors.length).toBeGreaterThanOrEqual(1);
    });

    it('enforces strict multi-tenant isolation: Tenant B sees zero monitors of Tenant A', async () => {
      const resA = await request(app)
        .get('/api/v1/monitors')
        .set('Authorization', 'Bearer dev-tenant-demo-tenant-1');
      expect(resA.status).toBe(200);
      expect(resA.body.monitors.length).toBeGreaterThanOrEqual(1);

      const resB = await request(app)
        .get('/api/v1/monitors')
        .set('Authorization', 'Bearer dev-tenant-isolated-tenant-2');
      expect(resB.status).toBe(200);
      expect(resB.body.monitors.length).toBe(0);
    });
  });

  describe('Monitor Management & Validation', () => {
    it('validates monitor payload with zod and rejects invalid intervals', async () => {
      const res = await request(app)
        .post('/api/v1/monitors')
        .set('Authorization', 'Bearer dev-tenant-demo-tenant-1')
        .send({
          name: 'Invalid Interval Monitor',
          url: 'https://example.com',
          intervalSec: 45, // Only 60 or 300 allowed
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('rejects monitor targeting AWS metadata IP with 400 SecurityViolation', async () => {
      const res = await request(app)
        .post('/api/v1/monitors')
        .set('Authorization', 'Bearer dev-tenant-demo-tenant-1')
        .send({
          name: 'SSRF Attack Probe',
          url: 'http://169.254.169.254/latest/user-data',
          intervalSec: 60,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('SecurityViolation');
    });

    it('creates a valid monitor successfully', async () => {
      const res = await request(app)
        .post('/api/v1/monitors')
        .set('Authorization', 'Bearer dev-tenant-demo-tenant-1')
        .send({
          name: 'Production Auth Endpoint',
          url: 'https://example.com/oauth/token',
          method: 'GET',
          expectedStatus: 200,
          intervalSec: 60,
          timeoutMs: 3000,
          alertEmail: 'alerts@demo.io',
        });

      expect(res.status).toBe(201);
      expect(res.body.monitor).toBeDefined();
      expect(res.body.monitor.monitorId).toMatch(/^mon-/);
      expect(res.body.monitor.state).toBe('up');
    });
  });

  describe('Public Tenant Status Page', () => {
    it('allows unauthenticated access to /api/v1/public/status/:slug', async () => {
      const res = await request(app).get('/api/v1/public/status/acme-corp');
      expect(res.status).toBe(200);
      expect(res.body.tenant.name).toBe('Acme Cloud Services');
      expect(res.body.systemState).toBeDefined();
      expect(Array.isArray(res.body.services)).toBe(true);
      expect(res.body.services.length).toBeGreaterThan(0);
      expect(res.body.services[0].uptimeBars.length).toBe(90); // 90-day daily uptime ticks
    });

    it('returns 404 for unknown tenant slug', async () => {
      const res = await request(app).get('/api/v1/public/status/non-existent-tenant-xyz');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NotFound');
    });
  });

  describe('Academic Cloud Evaluation & Benchmarks', () => {
    it('serves load-test results and cost analysis without authentication', async () => {
      const res = await request(app).get('/api/v1/eval/loadtest-results');
      expect(res.status).toBe(200);
      expect(res.body.region).toBe('ap-south-1');
      expect(res.body.benchmarks.length).toBe(4);
      expect(res.body.capacityPlanning.singleMicroMaxRps).toBeGreaterThan(1000);
      expect(res.body.costComparison.cloudMonthlyUsd.totalCloudOpEx).toBeDefined();
    });
  });
});
