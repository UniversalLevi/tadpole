/**
 * Bet worker (optional). Processes prediction bet jobs from the queue.
 * Run: npm run worker:bet
 * Enable by setting USE_BET_QUEUE=true and using the queue in bet routes.
 */
import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongo.js';
import { config } from '../config/index.js';
import { logWithContext } from '../logs/index.js';
import { placeBet } from '../bet/bet.service.js';
import { publishBetConfirmed } from '../lib/walletUpdatesPub.js';
import type { BetJobData } from '../queue/bet.queue.js';

const QUEUE_NAME = 'bet-requests';

async function processBet(data: BetJobData): Promise<void> {
  if (data.gameId !== 'prediction') return;
  try {
    const result = await placeBet(data.userId, data.roundId, data.prediction, data.amount);
    publishBetConfirmed({
      userId: data.userId,
      betId: result.betId,
      roundId: result.roundId,
      prediction: result.prediction,
      amount: result.amount,
    });
    logWithContext('info', 'Bet job completed', { userId: data.userId, betId: result.betId });
  } catch (e) {
    logWithContext('warn', 'Bet job failed', { userId: data.userId, roundId: data.roundId, error: e instanceof Error ? e.message : e });
    throw e;
  }
}

function runWorker(): void {
  const redisUrl = config.redisUrl;
  if (!redisUrl || redisUrl === '') {
    logWithContext('error', 'Bet worker: REDIS_URL not set');
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
      const data = job.data as BetJobData;
      await processBet(data);
    },
    { connection: { host, port }, concurrency: 5 }
  );
  worker.on('completed', (job) => logWithContext('info', 'Bet job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logWithContext('error', 'Bet job failed', { jobId: job?.id, error: err?.message }));
  logWithContext('info', 'Bet worker started', { queue: QUEUE_NAME });
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
