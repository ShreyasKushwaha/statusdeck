import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db, MonitorRecord } from '../db/dynamo';
import { validateSafeUrl } from '../utils/ssrfGuard';
import { logWithReqId } from '../middleware/requestId';

const router = Router();

const monitorSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  url: z.string().url('Must be a valid URL'),
  method: z.enum(['GET', 'HEAD', 'POST']).default('GET'),
  expectedStatus: z.number().int().min(100).max(599).default(200),
  intervalSec: z.number().refine((val) => val === 60 || val === 300, {
    message: 'Interval must be either 60 (1 min) or 300 (5 min) seconds',
  }),
  timeoutMs: z.number().int().min(1000).max(30000).default(5000),
  alertEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
});

// GET /api/v1/monitors - List all monitors for tenant
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenantId!;
  try {
    const monitors = await db.listMonitors(tenantId);
    logWithReqId(req, `Retrieved ${monitors.length} monitors`);
    res.json({ monitors });
  } catch (err) {
    logWithReqId(req, 'Failed to list monitors', { error: String(err) });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to retrieve monitors' });
  }
});

// GET /api/v1/monitors/:id - Retrieve single monitor
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenantId!;
  const monitorId = req.params.id;

  try {
    const monitor = await db.getMonitor(tenantId, monitorId);
    if (!monitor) {
      res.status(404).json({ error: 'NotFound', message: `Monitor '${monitorId}' not found.` });
      return;
    }
    res.json({ monitor });
  } catch (err) {
    logWithReqId(req, `Failed to retrieve monitor ${monitorId}`, { error: String(err) });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to retrieve monitor' });
  }
});

// POST /api/v1/monitors - Create new monitor
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenantId!;

  const parseResult = monitorSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'ValidationError',
      issues: parseResult.error.issues,
    });
    return;
  }

  const { name, url, method, expectedStatus, intervalSec, timeoutMs, alertEmail } = parseResult.data;

  // SSRF Protection Guard
  const ssrfCheck = await validateSafeUrl(url);
  if (!ssrfCheck.isSafe) {
    logWithReqId(req, `SSRF check rejected URL: ${url}`, { reason: ssrfCheck.reason });
    res.status(400).json({
      error: 'SecurityViolation',
      message: `Invalid URL: ${ssrfCheck.reason}`,
    });
    return;
  }

  const monitorId = `mon-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  const newMonitor: MonitorRecord = {
    tenantId,
    monitorId,
    name,
    url,
    method,
    expectedStatus,
    intervalSec,
    timeoutMs,
    state: 'up',
    alertEmail: alertEmail || undefined,
    lastCheckedAt: now,
    avgLatencyMs: 45,
    uptimePct90d: 100.0,
    consecutiveFailures: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.putMonitor(newMonitor);
    logWithReqId(req, `Created monitor ${monitorId} for URL ${url}`);
    res.status(201).json({ monitor: newMonitor });
  } catch (err) {
    logWithReqId(req, 'Failed to save monitor', { error: String(err) });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to create monitor' });
  }
});

// PUT /api/v1/monitors/:id - Update monitor
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenantId!;
  const monitorId = req.params.id;

  const existing = await db.getMonitor(tenantId, monitorId);
  if (!existing) {
    res.status(404).json({ error: 'NotFound', message: `Monitor '${monitorId}' not found.` });
    return;
  }

  const parseResult = monitorSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'ValidationError',
      issues: parseResult.error.issues,
    });
    return;
  }

  const { name, url, method, expectedStatus, intervalSec, timeoutMs, alertEmail } = parseResult.data;

  // SSRF Protection Guard
  const ssrfCheck = await validateSafeUrl(url);
  if (!ssrfCheck.isSafe) {
    res.status(400).json({
      error: 'SecurityViolation',
      message: `Invalid URL: ${ssrfCheck.reason}`,
    });
    return;
  }

  const updated: MonitorRecord = {
    ...existing,
    name,
    url,
    method,
    expectedStatus,
    intervalSec,
    timeoutMs,
    alertEmail: alertEmail || undefined,
    updatedAt: new Date().toISOString(),
  };

  try {
    await db.putMonitor(updated);
    logWithReqId(req, `Updated monitor ${monitorId}`);
    res.json({ monitor: updated });
  } catch (err) {
    logWithReqId(req, `Failed to update monitor ${monitorId}`, { error: String(err) });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to update monitor' });
  }
});

// DELETE /api/v1/monitors/:id - Delete monitor
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenantId!;
  const monitorId = req.params.id;

  const existing = await db.getMonitor(tenantId, monitorId);
  if (!existing) {
    res.status(404).json({ error: 'NotFound', message: `Monitor '${monitorId}' not found.` });
    return;
  }

  try {
    await db.deleteMonitor(tenantId, monitorId);
    logWithReqId(req, `Deleted monitor ${monitorId}`);
    res.status(204).send();
  } catch (err) {
    logWithReqId(req, `Failed to delete monitor ${monitorId}`, { error: String(err) });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to delete monitor' });
  }
});

export default router;
