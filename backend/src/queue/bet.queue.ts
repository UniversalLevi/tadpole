import { Queue } from 'bullmq';
import { config } from '../config/index.js';
import { logWithContext } from '../logs/index.js';

const QUEUE_NAME = 'bet-requests';

let queue: Queue | null = null;

function getConnectionOptions(): { host: string; port: number } | null {
  const url = config.redisUrl;
  if (!url || url === '') return null;
  try {
    const u = new URL(url);
    return { host: u.hostname || 'localhost', port: u.port ? parseInt(u.port, 10) : 6379 };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

export function getBetQueue(): Queue | null {
  if (queue) return queue;
  const conn = getConnectionOptions();
  if (!conn) return null;
  try {
    queue = new Queue(QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        removeOnComplete: { count: 5000 },
        removeOnFail: { count: 1000 },
      },
    });
  } catch (e) {
    logWithContext('warn', 'Bet queue init failed', { error: e instanceof Error ? e.message : e });
    return null;
  }
  return queue;
}

export interface BetJobData {
  gameId: 'prediction';
  userId: string;
  roundId: string;
  prediction: number;
  amount: number;
}

export async function addBetJob(data: BetJobData): Promise<string | null> {
  const q = getBetQueue();
  if (!q) return null;
  try {
    const job = await q.add('place', data, { jobId: `pred:${data.userId}:${data.roundId}:${Date.now()}` });
    return job.id ?? null;
  } catch (e) {
    logWithContext('warn', 'Failed to enqueue bet', { error: e instanceof Error ? e.message : e });
    return null;
  }
}

export async function closeBetQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
