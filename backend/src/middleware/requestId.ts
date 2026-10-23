import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      id: string;
      tenantId?: string;
      userEmail?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header('x-request-id');
  const reqId = incomingId && incomingId.trim().length > 0 ? incomingId : crypto.randomUUID();
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
}

/**
 * Standard log helper ensuring request ID is prepended to every log line
 */
export function logWithReqId(req: Request, message: string, meta?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const tenant = req.tenantId ? ` [tenant:${req.tenantId}]` : '';
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${timestamp}] [req:${req.id}]${tenant} ${message}${metaStr}`);
}
