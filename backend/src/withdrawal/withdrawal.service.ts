import mongoose from 'mongoose';
import { WithdrawalRequest } from '../models/index.js';
import { getMongoSession, runTransaction } from '../db/mongo.js';
import { updateBalance } from '../wallet/wallet.service.js';
import { logWithContext } from '../logs/index.js';
import { auditLog } from '../lib/audit.js';
import { runWithdrawalEligibilityChecks } from './withdrawal.eligibility.js';
import { addWithdrawalJob } from '../queue/withdrawal.queue.js';
import { flagDepositInstantWithdraw, checkSamePayoutDestination } from '../fraud/detectFraud.js';

function isReplicaSetRequiredError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('replica set') || msg.includes('Transaction numbers');
}

export interface CreateWithdrawalParams {
  userId: string;
  amount: number;
  method: 'bank' | 'upi';
  upiId?: string;
  bankAccountRef?: string;
  bankIfsc?: string;
}

export async function createWithdrawalRequest(
  params: CreateWithdrawalParams
): Promise<string> {
  const { userId, amount, method, upiId, bankAccountRef, bankIfsc } = params;
  const eligibility = await runWithdrawalEligibilityChecks(userId, amount);
  if (!eligibility.allowed) {
    if (eligibility.reasonCode === 'deposit_cooldown') {
      flagDepositInstantWithdraw(userId).catch(() => {});
    }
    throw new Error(eligibility.reason ?? 'Withdrawal not allowed');
  }
  checkSamePayoutDestination(userId, upiId, bankAccountRef, bankIfsc).catch(() => {});

  const payload = {
    userId: new mongoose.Types.ObjectId(userId),
    amount,
    method,
    status: 'pending' as const,
    ...(upiId && { upiId }),
    ...(bankAccountRef && { bankAccountRef }),
    ...(bankIfsc && { bankIfsc }),
  };

  const session = await getMongoSession();
  let requestId: string;
  try {
    await runTransaction(session, async () => {
      const wr = await WithdrawalRequest.create([payload], { session });
      requestId = wr[0]._id.toString();
      await updateBalance(userId, {
        type: 'withdrawal_request',
        amount: -amount,
        referenceId: requestId,
        session,
      });
    });
    auditLog('withdraw_request', { userId, metadata: { requestId: requestId!, amount, method } });
    addWithdrawalJob(requestId!).catch(() => {});
    return requestId!;
  } catch (e) {
    if (isReplicaSetRequiredError(e)) {
      const wr = await WithdrawalRequest.create([payload]);
      requestId = wr[0]._id.toString();
      await updateBalance(userId, {
        type: 'withdrawal_request',
        amount: -amount,
        referenceId: requestId,
      });
      auditLog('withdraw_request', { userId, metadata: { requestId, amount, method } });
      addWithdrawalJob(requestId).catch(() => {});
      return requestId;
    }
    throw e;
  } finally {
    await session.endSession();
  }
}

export async function getMyWithdrawals(userId: string) {
  return WithdrawalRequest.find({ userId }).sort({ requestedAt: -1 }).lean();
}

export async function listPendingWithdrawals() {
  return WithdrawalRequest.find({ status: 'pending' })
    .populate('userId', 'email')
    .sort({ requestedAt: 1 })
    .lean();
}

export async function listAllWithdrawals() {
  return WithdrawalRequest.find()
    .populate('userId', 'email')
    .sort({ requestedAt: -1 })
    .lean();
}

export async function approveWithdrawal(
  withdrawalId: string,
  adminUserId: string
) {
  const session = await getMongoSession();
  try {
    await runTransaction(session, async () => {
      const wr = await WithdrawalRequest.findById(withdrawalId).session(session);
      if (!wr) throw new Error('Withdrawal request not found');
      if (wr.status !== 'pending') {
        throw new Error('Withdrawal already processed');
      }
      await WithdrawalRequest.updateOne(
        { _id: wr._id },
        {
          $set: {
            status: 'completed',
            processedAt: new Date(),
            processedBy: new mongoose.Types.ObjectId(adminUserId),
          },
        },
        { session }
      );
      logWithContext('info', 'Withdrawal approved (manual)', {
        withdrawalId,
        userId: wr.userId.toString(),
        amount: wr.amount,
        processedBy: adminUserId,
      });
      auditLog('withdraw_approved', {
        userId: wr.userId.toString(),
        metadata: { withdrawalId, amount: wr.amount, processedBy: adminUserId },
      });
    });
  } catch (e) {
    if (isReplicaSetRequiredError(e)) {
      const wr = await WithdrawalRequest.findById(withdrawalId);
      if (!wr) throw new Error('Withdrawal request not found');
      if (wr.status !== 'pending') {
        throw new Error('Withdrawal already processed');
      }
      await WithdrawalRequest.updateOne(
        { _id: wr._id },
        {
          $set: {
            status: 'completed',
            processedAt: new Date(),
            processedBy: new mongoose.Types.ObjectId(adminUserId),
          },
        }
      );
      logWithContext('info', 'Withdrawal approved (manual)', {
        withdrawalId,
        userId: wr.userId.toString(),
        amount: wr.amount,
        processedBy: adminUserId,
      });
      auditLog('withdraw_approved', {
        userId: wr.userId.toString(),
        metadata: { withdrawalId, amount: wr.amount, processedBy: adminUserId },
      });
    } else {
      throw e;
    }
  } finally {
    await session.endSession();
  }
}

export async function rejectWithdrawal(
  withdrawalId: string,
  adminUserId: string
) {
  const session = await getMongoSession();
  try {
    await runTransaction(session, async () => {
      const wr = await WithdrawalRequest.findById(withdrawalId).session(session);
      if (!wr) throw new Error('Withdrawal request not found');
      if (wr.status !== 'pending') {
        throw new Error('Withdrawal already processed');
      }
      await WithdrawalRequest.updateOne(
        { _id: wr._id },
        {
          $set: {
            status: 'rejected',
            processedAt: new Date(),
            processedBy: new mongoose.Types.ObjectId(adminUserId),
          },
        },
        { session }
      );
      await updateBalance(wr.userId.toString(), {
        type: 'withdrawal_refund',
        amount: wr.amount,
        referenceId: withdrawalId,
        session,
      });
      logWithContext('info', 'Withdrawal rejected, refunded', {
        withdrawalId,
        userId: wr.userId.toString(),
        amount: wr.amount,
        processedBy: adminUserId,
      });
      auditLog('withdraw_rejected', {
        userId: wr.userId.toString(),
        metadata: { withdrawalId, amount: wr.amount, processedBy: adminUserId },
      });
    });
  } catch (e) {
    if (isReplicaSetRequiredError(e)) {
      const wr = await WithdrawalRequest.findById(withdrawalId);
      if (!wr) throw new Error('Withdrawal request not found');
      if (wr.status !== 'pending') {
        throw new Error('Withdrawal already processed');
      }
      await WithdrawalRequest.updateOne(
        { _id: wr._id },
        {
          $set: {
            status: 'rejected',
            processedAt: new Date(),
            processedBy: new mongoose.Types.ObjectId(adminUserId),
          },
        }
      );
      await updateBalance(wr.userId.toString(), {
        type: 'withdrawal_refund',
        amount: wr.amount,
        referenceId: withdrawalId,
      });
      logWithContext('info', 'Withdrawal rejected, refunded', {
        withdrawalId,
        userId: wr.userId.toString(),
        amount: wr.amount,
        processedBy: adminUserId,
      });
      auditLog('withdraw_rejected', {
        userId: wr.userId.toString(),
        metadata: { withdrawalId, amount: wr.amount, processedBy: adminUserId },
      });
    } else {
      throw e;
    }
  } finally {
    await session.endSession();
  }
}
