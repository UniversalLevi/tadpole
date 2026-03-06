import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { connectMongo } from './db/mongo.js';
import { config } from './config/index.js';
import { requestId, requestLogger, authRateLimiter, generalRateLimiter, verifyJwt, requireAdmin, betRateLimiter, depositRateLimiter } from './middleware/index.js';
import { logWithContext } from './logs/index.js';
import { authRoutes } from './auth/index.js';
import { walletRoutes } from './wallet/index.js';
import { paymentRoutes, webhookRoute } from './payment/index.js';
import { withdrawalRoutes } from './withdrawal/index.js';
import { adminRoutes } from './admin/index.js';
import { betRoutes } from './bet/index.js';
import { gameRoutes } from './game/index.js';
import { userRoutes } from './user/index.js';
import { bonusRoutes } from './bonus/index.js';
import { initSocket } from './socket/index.js';
import { recoverRoundOnStartup, startAviatorEngine, startRoundScheduler } from './scheduler/roundScheduler.js';
import { aviatorRoutes } from './games/aviator/index.js';
import { recordRequest, getMetrics, getContentType } from './metrics/index.js';
import { getCacheRedis } from './cache/index.js';

const app = express();

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// In production, redirect HTTP to HTTPS when behind a proxy that sets x-forwarded-proto
app.use(httpsRedirect);
// Strict CORS: set FRONTEND_ORIGIN to a single allowed origin (no wildcard) in production
app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(helmet());
app.use(requestId);
app.use(requestLogger);
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => recordRequest(req, res.statusCode, Date.now() - start));
  next();
});

// Webhook must receive raw body for signature verification
app.post('/payment/webhook', express.raw({ type: 'application/json' }), webhookRoute);

app.use(express.json());

app.use(generalRateLimiter);

app.get('/health', async (_req, res) => {
  const health: { ok: boolean; mongo?: string; redis?: string } = { ok: true };
  try {
    await mongoose.connection.db?.admin().ping();
    health.mongo = 'connected';
  } catch {
    health.ok = false;
    health.mongo = 'disconnected';
  }
  const redis = getCacheRedis();
  if (redis) {
    try {
      await redis.ping();
      health.redis = 'connected';
    } catch {
      health.ok = false;
      health.redis = 'disconnected';
    }
  }
  if (!health.ok) res.status(503);
  res.json(health);
});

app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', getContentType());
    res.end(await getMetrics());
  } catch (e) {
    res.status(500).end('');
  }
});

app.use('/auth', authRateLimiter, authRoutes);
app.use('/wallet', verifyJwt, walletRoutes);
app.use('/payment', verifyJwt, paymentRoutes);
app.use('/withdrawal', verifyJwt, withdrawalRoutes);
app.use('/bet', verifyJwt, betRateLimiter, betRoutes);
app.use('/game', gameRoutes);
app.use('/aviator', verifyJwt, aviatorRoutes);
app.use('/user', verifyJwt, userRoutes);
app.use('/bonus', verifyJwt, bonusRoutes);
app.use('/admin', verifyJwt, requireAdmin, adminRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logWithContext('error', 'Unhandled error', { error: err.message, stack: err.stack });
  const isProduction = config.nodeEnv === 'production';
  res.status(500).json(isProduction ? { error: 'Internal server error' } : { error: err.message, stack: err.stack });
});

function httpsRedirect(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (config.nodeEnv !== 'production') return next();
  const proto = req.get('x-forwarded-proto');
  if (proto === 'https') return next();
  res.redirect(301, `https://${req.get('host') ?? req.hostname}${req.originalUrl}`);
}

async function start() {
  await connectMongo();
  const httpServer = http.createServer(app);
  initSocket(httpServer);
  await recoverRoundOnStartup();
  startRoundScheduler();
  startAviatorEngine();
  httpServer.listen(config.port, () => {
    logWithContext('info', 'Server started', { port: config.port });
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
