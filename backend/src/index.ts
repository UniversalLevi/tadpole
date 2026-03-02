import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { connectMongo } from './db/mongo.js';
import { config } from './config/index.js';
import { requestId, requestLogger, authRateLimiter, generalRateLimiter, verifyJwt, requireAdmin, betRateLimiter, depositRateLimiter, withdrawRateLimiter } from './middleware/index.js';
import { logWithContext } from './logs/index.js';
import { authRoutes } from './auth/index.js';
import { walletRoutes } from './wallet/index.js';
import { paymentRoutes, webhookRoute } from './payment/index.js';
import { withdrawalRoutes } from './withdrawal/index.js';
import { adminRoutes } from './admin/index.js';
import { betRoutes } from './bet/index.js';
import { gameRoutes } from './game/index.js';
import { initSocket } from './socket/index.js';
import { recoverRoundOnStartup, startRoundScheduler } from './scheduler/roundScheduler.js';

const app = express();

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(helmet());
app.use(requestId);
app.use(requestLogger);

// Webhook must receive raw body for signature verification
app.post('/payment/webhook', express.raw({ type: 'application/json' }), webhookRoute);

app.use(express.json());

app.use(generalRateLimiter);

app.get('/health', async (_req, res) => {
  try {
    await mongoose.connection.db?.admin().ping();
    res.json({ ok: true, mongo: 'connected' });
  } catch {
    res.status(503).json({ ok: false, mongo: 'disconnected' });
  }
});

app.use('/auth', authRateLimiter, authRoutes);
app.use('/wallet', verifyJwt, walletRoutes);
app.use('/payment', verifyJwt, paymentRoutes);
app.use('/withdrawal', verifyJwt, withdrawRateLimiter, withdrawalRoutes);
app.use('/bet', verifyJwt, betRateLimiter, betRoutes);
app.use('/game', gameRoutes);
app.use('/admin', verifyJwt, requireAdmin, adminRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logWithContext('error', 'Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await connectMongo();
  const httpServer = http.createServer(app);
  initSocket(httpServer);
  await recoverRoundOnStartup();
  startRoundScheduler();
  httpServer.listen(config.port, () => {
    logWithContext('info', 'Server started', { port: config.port });
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
