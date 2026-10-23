import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config';
import { requestIdMiddleware, logWithReqId } from './middleware/requestId';
import { apiRateLimiter } from './middleware/rateLimiter';
import { authMiddleware } from './middleware/auth';

import healthRouter from './routes/health';
import monitorsRouter from './routes/monitors';
import resultsRouter from './routes/results';
import incidentsRouter from './routes/incidents';
import publicRouter from './routes/public';
import evalRouter from './routes/eval';

const app = express();

// Global Middlewares
app.use(cors());
app.use(express.json());
app.use(requestIdMiddleware);

// Unprotected Health endpoints for ALB and monitoring
app.use('/health', healthRouter);
app.use('/api/v1/health', healthRouter);

// Public tenant status page (No auth required)
app.use('/api/v1/public', publicRouter);

// Evaluation benchmarks & architectural stats (Public for academic defense)
app.use('/api/v1/eval', evalRouter);

// Rate limiter on protected API routes
app.use('/api/v1', apiRateLimiter);

// Protected routes requiring Cognito JWT / Auth Middleware
app.use('/api/v1/monitors', authMiddleware, monitorsRouter);
app.use('/api/v1/monitors', authMiddleware, resultsRouter); // /:id/results
app.use('/api/v1/incidents', authMiddleware, incidentsRouter);

// 404 Handler
app.use((req: Request, res: Response) => {
  logWithReqId(req, `404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'NotFound',
    message: `Endpoint ${req.method} ${req.originalUrl} not found on StatusDeck API`,
    requestId: req.id,
  });
});

// Centralized Error Handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logWithReqId(req, `Unhandled server error: ${err.message}`, { stack: err.stack });
  res.status(500).json({
    error: 'InternalServerError',
    message: 'An unexpected server error occurred.',
    requestId: req.id,
  });
});

// Start Server if not imported by test suite
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(config.port, () => {
    console.log(`====================================================`);
    console.log(` STATUSDECK API SERVER INITIALIZED`);
    console.log(` Port: ${config.port} | Region: ${config.awsRegion} | Env: ${config.nodeEnv}`);
    console.log(` Health probe: http://localhost:${config.port}/health`);
    console.log(` Public Status: http://localhost:${config.port}/api/v1/public/status/acme-corp`);
    console.log(`====================================================`);
  });

  // Graceful shutdown for EC2 container instances
  const shutdown = () => {
    console.log('Received termination signal. Closing HTTP connections...');
    server.close(() => {
      console.log('StatusDeck API shut down cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export default app;
