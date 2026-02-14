import mongoose from 'mongoose';
import { Wallet, WalletTransaction } from '../models/index.js';
import type { WalletTransactionType } from '../models/index.js';
import { getMongoSession } from '../db/mongo.js';
import { logWithContext } from '../logs/index.js';

export async function createWalletIfMissing(
  userId: mongoose.Types.ObjectId,
  session?: mongoose.mongo.ClientSession
): Promise<void> {
  const opts = session ? { session } : {};
  const existing = await Wallet.findOne({ userId }, null, opts);
  if (existing) return;
  await Wallet.create(
    [
      {
        userId,
        availableBalance: 0,
        lockedBalance: 0,
        currency: 'INR',
      },
    ],
    opts
  );
}

function isReplicaSetRequiredError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('replica set') || msg.includes('Transaction numbers');
}

export async function getWallet(userId: string) {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    const session = await getMongoSession();
    try {
      await session.withTransaction(async () => {
        await createWalletIfMissing(new mongoose.Types.ObjectId(userId), session);
      });
      wallet = await Wallet.findOne({ userId });
    } catch (e) {
      if (isReplicaSetRequiredError(e)) {
        await createWalletIfMissing(new mongoose.Types.ObjectId(userId));
        wallet = await Wallet.findOne({ userId });
      } else {
        throw e;
      }
    } finally {
      await session.endSession();
    }
  }
  return wallet;
}

export async function getTransactions(
  userId: string,
  page: number = 1,
  limit: number = 20
) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    WalletTransaction.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    WalletTransaction.countDocuments({ userId }),
  ]);
  return { items, total, page, limit };
}

export interface UpdateBalanceOptions {
  type: WalletTransactionType;
  amount: number; // positive = credit, negative = debit
  referenceId?: string;
  session?: mongoose.mongo.ClientSession;
}

/**
 * Updates wallet balance and appends a ledger entry.
 * When session is provided, runs inside a transaction; otherwise runs without (e.g. standalone MongoDB in dev).
 * For debits, checks availableBalance >= |amount|.
 */
export async function updateBalance(
  userId: string,
  options: UpdateBalanceOptions
): Promise<{ balanceAfter: number }> {
  const { type, amount, referenceId, session } = options;
  const uid = new mongoose.Types.ObjectId(userId);

  const findOpts = session ? { session } : {};
  let w = await Wallet.findOne({ userId: uid }, null, findOpts);
  if (!w) {
    await createWalletIfMissing(uid, session);
    w = await Wallet.findOne({ userId: uid }, null, findOpts);
    if (!w) throw new Error('Wallet not found');
  }

  const balanceBefore = w.availableBalance;
  const balanceAfter = balanceBefore + amount;

  if (balanceAfter < 0) {
    throw new Error('Insufficient balance');
  }

  const createOpts = session ? { session } : {};
  await WalletTransaction.create(
    [
      {
        userId: uid,
        type,
        amount,
        balanceBefore,
        balanceAfter,
        status: 'completed',
        referenceId,
      },
    ],
    createOpts
  );

  await Wallet.updateOne(
    { userId: uid },
    { $set: { availableBalance: balanceAfter } },
    findOpts
  );

  logWithContext('info', 'Wallet updated', {
    userId,
    type,
    amount,
    balanceAfter,
    referenceId,
  });

  return { balanceAfter };
}
