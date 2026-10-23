import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { config } from '../config';
import { logWithReqId } from './requestId';

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

// Initialize Cognito verifier if valid pool ID is configured
if (
  config.cognito.userPoolId &&
  !config.cognito.userPoolId.includes('dummy') &&
  config.cognito.clientId &&
  !config.cognito.clientId.includes('dummy')
) {
  try {
    verifier = CognitoJwtVerifier.create({
      userPoolId: config.cognito.userPoolId,
      tokenUse: 'id',
      clientId: config.cognito.clientId,
    });
  } catch (err) {
    console.warn('[AUTH] Could not initialize CognitoJwtVerifier with current env:', err);
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.header('authorization');

  if (!authHeader) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization header is missing. Bearer token required.',
    });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authorization format. Format must be "Bearer <token>".',
    });
    return;
  }

  const token = parts[1];

  // Dev / Mock / Test bypass support
  if (token.startsWith('dev-tenant-') || (config.isDevMode && token.startsWith('mock-'))) {
    const rawTenant = token.replace(/^(dev-tenant-|mock-)/, '');
    req.tenantId = rawTenant || 'default-tenant';
    req.userEmail = `${req.tenantId}@statusdeck.internal`;
    logWithReqId(req, `Authenticated via development token for tenant ${req.tenantId}`);
    next();
    return;
  }

  // Live Cognito verification
  if (verifier) {
    try {
      const payload = await verifier.verify(token);
      // Derive tenantId from custom:tenantId, cognito:username, or sub
      const tenantId =
        (payload['custom:tenantId'] as string) ||
        (payload['cognito:username'] as string) ||
        (payload.sub as string);

      req.tenantId = tenantId;
      req.userEmail = (payload.email as string) || `${tenantId}@cognito.user`;
      logWithReqId(req, `Authenticated via Cognito JWT for tenant ${req.tenantId}`);
      next();
      return;
    } catch (err) {
      logWithReqId(req, 'Cognito JWT verification failed', { error: String(err) });
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired Cognito JWT.',
      });
      return;
    }
  }

  // Fallback in local development without live Cognito credentials
  if (config.isDevMode) {
    // Decode non-verified token payload or treat token as tenant identifier
    req.tenantId = token.length < 50 ? token : 'demo-tenant-1';
    req.userEmail = `${req.tenantId}@statusdeck.local`;
    logWithReqId(req, `Development mode active: accepted token for tenant ${req.tenantId}`);
    next();
    return;
  }

  res.status(401).json({
    error: 'Unauthorized',
    message: 'Authentication service unavailable or unconfigured.',
  });
}
