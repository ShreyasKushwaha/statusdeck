import { Router, Request, Response } from 'express';
import { db } from '../db/dynamo';
import { logWithReqId } from '../middleware/requestId';

const router = Router();

// GET /api/v1/incidents - List incidents for current tenant
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenantId!;

  try {
    const incidents = await db.getIncidentsByTenant(tenantId);
    logWithReqId(req, `Retrieved ${incidents.length} incidents for tenant`);
    res.json({ incidents });
  } catch (err) {
    logWithReqId(req, 'Failed to retrieve incidents', { error: String(err) });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to retrieve incidents' });
  }
});

export default router;
