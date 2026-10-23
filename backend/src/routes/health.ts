import { Router, Request, Response } from 'express';
import { config } from '../config';
import { logWithReqId } from '../middleware/requestId';

const router = Router();

router.get(['/', '/health'], (req: Request, res: Response) => {
  logWithReqId(req, 'ALB Health check probe received');
  res.status(200).json({
    status: 'ok',
    service: 'statusdeck-api',
    region: config.awsRegion,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    requestId: req.id,
  });
});

export default router;
