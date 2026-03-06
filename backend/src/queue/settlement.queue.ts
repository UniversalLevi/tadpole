import { Queue } from 'bullmq';
import { config } from '../config/index.js';
import { logWithContext } from '../logs/index.js';

const QUEUE_NAME = 'settlement';

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

export function getSettlementQueue(): Queue | null {
  if (queue) return queue;
  const conn = getConnectionOptions();
  if (!conn) return null;
  try {
    queue = new Queue(QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        removeOnComplete: { count: 2000 },
        removeOnFail: { count: 1000 },
      },
    });
  } catch (e) {
    logWithContext('warn', 'Settlement queue init failed', { error: e instanceof Error ? e.message : e });
    return null;
  }
  return queue;
}

export interface SettlementJobData {
  roundId: string;
  gameId: 'prediction' | 'aviator';
  /** When set (e.g. aviator), worker only publishes wallet updates for these users; no DB settlement. */
  affectedUserIds?: string[];
}

export async function addSettlementJob(roundId: string, gameId: 'prediction' | 'aviator', affectedUserIds?: string[]): Promise<boolean> {
  const q = getSettlementQueue();
  if (!q) return false;
  try {
    const data: SettlementJobData = { roundId, gameId };
    if (affectedUserIds?.length) data.affectedUserIds = affectedUserIds;
    await q.add('settle', data, { jobId: `${gameId}:${roundId}` });
    return true;
  } catch (e) {
    logWithContext('warn', 'Failed to enqueue settlement', { roundId, gameId, error: e instanceof Error ? e.message : e });
    return false;
  }
}

export async function closeSettlementQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
