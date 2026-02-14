import mongoose from 'mongoose';
import { User, WithdrawalRequest } from '../models/index.js';
import { config } from '../config/index.js';
import { getMongoSession } from '../db/mongo.js';
import { updateBalance } from '../wallet/wallet.service.js';
import { logWithContext } from '../logs/index.js';

function isReplicaSetRequiredError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('replica set') || msg.includes('Transaction numbers');
}

export async function createWithdrawalRequest(userId: string, amount: number) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (user.isFrozen) throw new Error('Account is frozen');
  if (amount < config.minWithdrawalAmount) {
    throw new Error(`Minimum withdrawal is ${config.minWithdrawalAmount} INR`);
  }

  const session = await getMongoSession();
  let requestId: string;
  try {
    await session.withTransaction(async () => {
      const wr = await WithdrawalRequest.create(
        [
          {
            userId: new mongoose.Types.ObjectId(userId),
            amount,
            status: 'pending',
          },
        ],
        { session }
      );
      requestId = wr[0]._id.toString();
      await updateBalance(userId, {
        type: 'withdrawal_request',
        amount: -amount,
        referenceId: requestId,
        session,
      });
    });
    return requestId!;
  } catch (e) {
    if (isReplicaSetRequiredError(e)) {
      const wr = await WithdrawalRequest.create([
        {
          userId: new mongoose.Types.ObjectId(userId),
          amount,
          status: 'pending',
        },
      ]);
      requestId = wr[0]._id.toString();
      await updateBalance(userId, {
        type: 'withdrawal_request',
        amount: -amount,
        referenceId: requestId,
      });
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
    await session.withTransaction(async () => {
      const wr = await WithdrawalRequest.findById(withdrawalId).session(session);
      if (!wr) throw new Error('Withdrawal request not found');
      if (wr.status !== 'pending') {
        throw new Error('Withdrawal already processed');
      }
      await WithdrawalRequest.updateOne(
        { _id: wr._id },
        {
          $set: {
            status: 'approved',
            processedAt: new Date(),
            processedBy: new mongoose.Types.ObjectId(adminUserId),
          },
        },
        { session }
      );
      logWithContext('info', 'Withdrawal approved', {
        withdrawalId,
        userId: wr.userId.toString(),
        amount: wr.amount,
        processedBy: adminUserId,
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
            status: 'approved',
            processedAt: new Date(),
            processedBy: new mongoose.Types.ObjectId(adminUserId),
          },
        }
      );
      logWithContext('info', 'Withdrawal approved', {
        withdrawalId,
        userId: wr.userId.toString(),
        amount: wr.amount,
        processedBy: adminUserId,
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
    await session.withTransaction(async () => {
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
    } else {
      throw e;
    }
  } finally {
    await session.endSession();
  }
}
