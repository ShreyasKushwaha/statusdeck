import { Router, Request, Response } from 'express';
import { db } from '../db/dynamo';
import { logWithReqId } from '../middleware/requestId';

const router = Router();

// GET /api/v1/monitors/:id/results?range=24h
router.get('/:id/results', async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenantId!;
  const monitorId = req.params.id;
  const range = (req.query.range as string) || '24h';

  try {
    const monitor = await db.getMonitor(tenantId, monitorId);
    if (!monitor) {
      res.status(404).json({ error: 'NotFound', message: `Monitor '${monitorId}' not found.` });
      return;
    }

    const allResults = await db.getResults(monitorId, 300);

    // Compute range cutoff
    const now = Date.now();
    let cutoffMs = 24 * 60 * 60 * 1000; // default 24h
    if (range === '7d') cutoffMs = 7 * 24 * 60 * 60 * 1000;
    if (range === '30d') cutoffMs = 30 * 24 * 60 * 60 * 1000;

    const filtered = allResults.filter(
      (r) => new Date(r.timestamp).getTime() >= now - cutoffMs
    );

    // Calculate metrics
    const totalChecks = filtered.length;
    const okChecks = filtered.filter((r) => r.ok).length;
    const uptimePct = totalChecks > 0 ? Number(((okChecks / totalChecks) * 100).toFixed(2)) : 100;

    const latencies = filtered.map((r) => r.latencyMs).sort((a, b) => a - b);
    const avgLatency =
      latencies.length > 0
        ? Math.round(latencies.reduce((sum, val) => sum + val, 0) / latencies.length)
        : 0;
    const p95Latency =
      latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1] : 0;
    const minLatency = latencies.length > 0 ? latencies[0] : 0;
    const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;

    logWithReqId(req, `Returned ${filtered.length} check results for monitor ${monitorId} (range: ${range})`);

    res.json({
      monitorId,
      range,
      metrics: {
        uptimePct,
        totalChecks,
        failedChecks: totalChecks - okChecks,
        avgLatency,
        p95Latency,
        minLatency,
        maxLatency,
      },
      results: filtered,
    });
  } catch (err) {
    logWithReqId(req, `Failed to retrieve results for monitor ${monitorId}`, { error: String(err) });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to retrieve check results' });
  }
});

export default router;
