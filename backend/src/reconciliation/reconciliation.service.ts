import mongoose from 'mongoose';
import { WithdrawalRequest, WalletTransaction, Payment } from '../models/index.js';
import { ReconciliationRun } from '../models/ReconciliationRun.js';
import { logWithContext } from '../logs/index.js';
import type { ReconciliationMismatch } from '../models/ReconciliationRun.js';

const RECONCILIATION_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function runReconciliation(): Promise<{ status: string; mismatchCount: number }> {
  const from = new Date(Date.now() - RECONCILIATION_WINDOW_MS);
  const mismatches: ReconciliationMismatch[] = [];
  let withdrawalsChecked = 0;
  let depositsChecked = 0;

  const completedWithdrawals = await WithdrawalRequest.find({
    status: 'completed',
    processedAt: { $gte: from },
  })
    .select('_id amount providerReference processedAt userId')
    .lean();

  for (const w of completedWithdrawals) {
    withdrawalsChecked++;
    const refId = w._id.toString();
    const tx = await WalletTransaction.findOne({
      type: 'withdrawal_complete',
      referenceId: refId,
      userId: w.userId,
    }).lean();
    if (!tx) {
      mismatches.push({
        type: 'withdrawal_complete_missing',
        referenceId: refId,
        description: 'Withdrawal marked completed but no withdrawal_complete wallet transaction',
        metadata: { amount: w.amount, userId: (w.userId as mongoose.Types.ObjectId).toString() },
      });
    }
  }

  const paidPayments = await Payment.find({
    status: 'paid',
    verified: true,
    updatedAt: { $gte: from },
  })
    .select('_id userId amount razorpayPaymentId')
    .lean();

  for (const p of paidPayments) {
    depositsChecked++;
    const refId = p.razorpayPaymentId ?? p._id.toString();
    const tx = await WalletTransaction.findOne({
      type: 'deposit',
      referenceId: refId,
      userId: p.userId,
      status: 'completed',
    }).lean();
    if (!tx) {
      mismatches.push({
        type: 'deposit_credited_missing',
        referenceId: refId,
        description: 'Payment marked paid but no completed deposit wallet transaction',
        metadata: { amount: p.amount, userId: (p.userId as mongoose.Types.ObjectId).toString() },
      });
    }
  }

  const status = mismatches.length > 0 ? 'mismatches' : 'ok';
  await ReconciliationRun.create({
    runAt: new Date(),
    status,
    mismatches,
    summary: {
      withdrawalsChecked,
      depositsChecked,
      mismatchCount: mismatches.length,
    },
  });

  if (mismatches.length > 0) {
    logWithContext('warn', 'Reconciliation found mismatches', { count: mismatches.length, mismatches: mismatches.slice(0, 5) });
  } else {
    logWithContext('info', 'Reconciliation completed OK', { withdrawalsChecked, depositsChecked });
  }

  return { status, mismatchCount: mismatches.length };
}
