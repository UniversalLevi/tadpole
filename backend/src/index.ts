import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { connectMongo } from './db/mongo.js';
import { config } from './config/index.js';
import { requestId, requestLogger, authRateLimiter, generalRateLimiter, verifyJwt, requireAdmin } from './middleware/index.js';
import { logWithContext } from './logs/index.js';
import { authRoutes } from './auth/index.js';
import { walletRoutes } from './wallet/index.js';
import { paymentRoutes, webhookRoute } from './payment/index.js';
import { withdrawalRoutes } from './withdrawal/index.js';
import { adminRoutes } from './admin/index.js';

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

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/auth', authRateLimiter, authRoutes);
app.use('/wallet', verifyJwt, walletRoutes);
app.use('/payment', verifyJwt, paymentRoutes);
app.use('/withdrawal', verifyJwt, withdrawalRoutes);
app.use('/admin', verifyJwt, requireAdmin, adminRoutes);

async function start() {
  await connectMongo();
  app.listen(config.port, () => {
    logWithContext('info', 'Server started', { port: config.port });
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
