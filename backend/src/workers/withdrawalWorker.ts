/**
 * Withdrawal payout worker. Run separately: npx tsx src/workers/withdrawalWorker.ts
 * Requires REDIS_URL and MONGODB_URI. Processes withdrawal-payouts queue.
 */
import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongo.js';
import { config } from '../config/index.js';
import { logWithContext } from '../logs/index.js';
import { WithdrawalRequest } from '../models/index.js';
import { runWithdrawalEligibilityChecks } from '../withdrawal/withdrawal.eligibility.js';
import { getPrimaryPayoutProvider, getFallbackPayoutProvider } from '../payment/providers/index.js';
import { appendTransactionRecord, updateBalance } from '../wallet/wallet.service.js';
import { addWithdrawalJobDelayed } from '../queue/withdrawal.queue.js';

const QUEUE_NAME = 'withdrawal-payouts';

async function processWithdrawal(withdrawalId: string): Promise<void> {
  const wr = await WithdrawalRequest.findById(withdrawalId).lean();
  if (!wr || wr.status !== 'pending') {
    return;
  }
  const userId = wr.userId.toString();
  const eligibility = await runWithdrawalEligibilityChecks(userId, wr.amount, withdrawalId);
  if (!eligibility.allowed) {
    await WithdrawalRequest.updateOne(
      { _id: withdrawalId },
      {
        $set: {
          status: 'failed',
          failureReason: eligibility.reason ?? 'Eligibility check failed',
          processedAt: new Date(),
        },
      }
    );
    await updateBalance(userId, {
      type: 'withdrawal_refund',
      amount: wr.amount,
      referenceId: withdrawalId,
    });
    logWithContext('info', 'Withdrawal failed eligibility in worker, refunded', { withdrawalId, reason: eligibility.reason });
    return;
  }

  await WithdrawalRequest.updateOne(
    { _id: withdrawalId },
    { $set: { status: 'processing' } }
  );

  const referenceId = withdrawalId;
  const params = {
    amount: wr.amount,
    currency: 'INR',
    referenceId,
    upiId: wr.upiId ?? undefined,
    bankAccountNumber: wr.bankAccountRef ?? undefined,
    bankIfsc: wr.bankIfsc ?? undefined,
    narration: 'Tadpole payout',
  };

  const primary = getPrimaryPayoutProvider();
  let result = await primary.createPayout(params);

  if (!result.success && getFallbackPayoutProvider()) {
    const fallback = getFallbackPayoutProvider()!;
    result = await fallback.createPayout(params);
  }

  if (result.success && result.providerReference) {
    await WithdrawalRequest.updateOne(
      { _id: withdrawalId },
      {
        $set: {
          status: 'completed',
          providerReference: result.providerReference,
          processedAt: new Date(),
        },
      }
    );
    await appendTransactionRecord(userId, 'withdrawal_complete', wr.amount, referenceId);
    logWithContext('info', 'Withdrawal completed', { withdrawalId, userId, providerRef: result.providerReference });
    return;
  }

  const attemptCount = (wr.attemptCount ?? 0) + 1;
  const delays = config.withdrawalRetryDelaysMs;
  const delayMs = delays[Math.min(attemptCount - 1, delays.length - 1)] ?? delays[delays.length - 1];

  if (attemptCount >= config.maxWithdrawalRetries) {
    await WithdrawalRequest.updateOne(
      { _id: withdrawalId },
      {
        $set: {
          status: 'failed',
          failureReason: result.error ?? 'Payout failed after retries',
          attemptCount,
          processedAt: new Date(),
        },
      }
    );
    await updateBalance(userId, {
      type: 'withdrawal_refund',
      amount: wr.amount,
      referenceId: withdrawalId,
    });
    logWithContext('warn', 'Withdrawal failed after max retries, refunded', { withdrawalId, attemptCount, error: result.error });
    return;
  }

  await WithdrawalRequest.updateOne(
    { _id: withdrawalId },
    {
      $set: {
        status: 'pending',
        attemptCount,
        nextRetryAt: new Date(Date.now() + delayMs),
      },
    }
  );
  await addWithdrawalJobDelayed(withdrawalId, delayMs);
  logWithContext('info', 'Withdrawal scheduled retry', { withdrawalId, attemptCount, delayMs, error: result.error });
}

function runWorker(): void {
  const redisUrl = config.redisUrl;
  if (!redisUrl) {
    logWithContext('error', 'Withdrawal worker: REDIS_URL not set');
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
      const { withdrawalId } = job.data as { withdrawalId: string };
      if (!withdrawalId) return;
      await processWithdrawal(withdrawalId);
    },
    { connection: { host, port }, concurrency: 5 }
  );

  worker.on('completed', (job) => {
    logWithContext('info', 'Withdrawal job completed', { jobId: job.id });
  });
  worker.on('failed', (job, err) => {
    logWithContext('error', 'Withdrawal job failed', { jobId: job?.id, error: err?.message });
  });

  logWithContext('info', 'Withdrawal worker started', { queue: QUEUE_NAME });
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
