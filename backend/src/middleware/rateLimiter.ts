import rateLimit from 'express-rate-limit';

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // Limit each IP / tenant to 200 requests per window
  standardHeaders: true, // Return standard RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded (200 requests per minute). Please throttle requests.',
  },
  keyGenerator: (req) => {
    // If tenantId is identified, isolate rate limit by tenant; otherwise use client IP
    return req.tenantId ? `tenant:${req.tenantId}` : (req.ip || 'unknown-client');
  },
});
