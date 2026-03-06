import { Queue } from 'bullmq';
import { config } from '../config/index.js';
import { logWithContext } from '../logs/index.js';

const QUEUE_NAME = 'withdrawal-payouts';

let queue: Queue | null = null;

function getConnectionOptions(): { host: string; port: number } | null {
  const url = config.redisUrl;
  if (!url) return null;
  try {
    const u = new URL(url);
    return { host: u.hostname || 'localhost', port: u.port ? parseInt(u.port, 10) : 6379 };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

export function getWithdrawalQueue(): Queue | null {
  if (queue) return queue;
  const conn = getConnectionOptions();
  if (!conn) return null;
  try {
    queue = new Queue(QUEUE_NAME, {
    connection: conn,
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
  } catch (e) {
    logWithContext('warn', 'Withdrawal queue init failed', { error: e instanceof Error ? e.message : e });
    return null;
  }
  return queue;
}

export interface WithdrawalJobData {
  withdrawalId: string;
}

export async function addWithdrawalJob(withdrawalId: string): Promise<boolean> {
  const q = getWithdrawalQueue();
  if (!q) return false;
  try {
    await q.add('payout', { withdrawalId } as WithdrawalJobData, { jobId: withdrawalId });
    return true;
  } catch (e) {
    logWithContext('warn', 'Failed to enqueue withdrawal', { withdrawalId, error: e instanceof Error ? e.message : e });
    return false;
  }
}

export async function addWithdrawalJobDelayed(withdrawalId: string, delayMs: number): Promise<boolean> {
  const q = getWithdrawalQueue();
  if (!q) return false;
  try {
    await q.add('payout', { withdrawalId } as WithdrawalJobData, { delay: delayMs, jobId: `${withdrawalId}_${Date.now()}` });
    return true;
  } catch (e) {
    logWithContext('warn', 'Failed to enqueue delayed withdrawal', { withdrawalId, error: e instanceof Error ? e.message : e });
    return false;
  }
}

export async function closeWithdrawalQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
