/**
 * Settlement worker. Run separately: npx tsx src/workers/settlementWorker.ts
 * Requires REDIS_URL and MONGODB_URI. Processes settlement queue (prediction + aviator wallet updates).
 */
import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongo.js';
import { config } from '../config/index.js';
import { logWithContext } from '../logs/index.js';
import { settleRound } from '../round/round.service.js';
import { getWallet } from '../wallet/wallet.service.js';
import { publishWalletUpdate } from '../lib/walletUpdatesPub.js';
import type { SettlementJobData } from '../queue/settlement.queue.js';

const QUEUE_NAME = 'settlement';

async function processSettlement(data: SettlementJobData): Promise<void> {
  const { roundId, gameId, affectedUserIds: jobUserIds } = data;
  let userIds: string[];

  if (gameId === 'prediction') {
    if (jobUserIds?.length) {
      userIds = jobUserIds;
    } else {
      const result = await settleRound(roundId);
      if (!result) {
        logWithContext('warn', 'Settlement job: settleRound returned null', { roundId });
        return;
      }
      userIds = result.affectedUserIds;
    }
  } else if (gameId === 'aviator' && jobUserIds?.length) {
    userIds = jobUserIds;
  } else {
    logWithContext('warn', 'Settlement job: no affectedUserIds for aviator', { roundId });
    return;
  }

  for (const userId of userIds) {
    try {
      const w = await getWallet(userId);
      if (w) publishWalletUpdate(userId, { availableBalance: w.availableBalance, lockedBalance: w.lockedBalance });
    } catch (e) {
      logWithContext('warn', 'Settlement worker: getWallet failed', { userId, error: e instanceof Error ? e.message : e });
    }
  }
  logWithContext('info', 'Settlement job done', { roundId, gameId, userCount: userIds.length });
}

function runWorker(): void {
  const redisUrl = config.redisUrl;
  if (!redisUrl || redisUrl === '') {
    logWithContext('error', 'Settlement worker: REDIS_URL not set');
    process.exit(1);
  }

  let host = 'localhost';
  let port = 6379;
  try {
    const u = new URL(redisUrl);
    host = u.hostname || host;
    port = u.port ? parseInt(u.port, 10) : port;
  } catch {
    // use defaults
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const data = job.data as SettlementJobData;
      if (!data.roundId || !data.gameId) return;
      await processSettlement(data);
    },
    { connection: { host, port }, concurrency: 3 }
  );

  worker.on('completed', (job) => {
    logWithContext('info', 'Settlement job completed', { jobId: job.id });
  });
  worker.on('failed', (job, err) => {
    logWithContext('error', 'Settlement job failed', { jobId: job?.id, error: err?.message });
  });

  logWithContext('info', 'Settlement worker started', { queue: QUEUE_NAME });
}

async function main(): Promise<void> {
  await connectMongo();
  runWorker();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  mongoose.disconnect().then(() => process.exit(0));
});
