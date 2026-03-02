import mongoose from 'mongoose';
import { User, Round, Bet } from '../models/index.js';
import { config } from '../config/index.js';
import { getSystemConfig } from '../models/SystemConfig.js';
import { getMongoSession, runTransaction } from '../db/mongo.js';
import { lockForBet } from '../wallet/wallet.service.js';
import { getCurrentRound } from '../round/round.service.js';
import { logWithContext } from '../logs/index.js';
import { auditLog } from '../lib/audit.js';
import { emitBetConfirmed } from '../socket/index.js';

export async function placeBet(
  userId: string,
  roundId: string,
  prediction: number,
  amount: number
): Promise<{ betId: string; roundId: string; prediction: number; amount: number }> {
  const sys = await getSystemConfig();
  if (sys.bettingPaused) throw new Error('Betting is temporarily paused');
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (user.isFrozen) throw new Error('Account is frozen');
  if (prediction < 0 || prediction > 9) throw new Error('Prediction must be 0-9');
  if (amount < config.minBetAmount || amount > config.maxBetAmount) {
    throw new Error(`Bet must be between ${config.minBetAmount} and ${config.maxBetAmount} INR`);
  }
  const round = await Round.findById(roundId).lean();
  if (!round) throw new Error('Round not found');
  if (round.status !== 'betting') throw new Error('Betting is closed for this round');
  const now = Date.now();
  if (now >= new Date(round.bettingClosesAt).getTime()) {
    throw new Error('Betting window has closed');
  }
  const session = await getMongoSession();
  const result = { betId: '' };
  try {
    await runTransaction(session, async () => {
      const roundDoc = await Round.findById(roundId).session(session);
      if (!roundDoc || roundDoc.status !== 'betting') throw new Error('Betting is closed for this round');
      if (Date.now() >= roundDoc.bettingClosesAt.getTime()) throw new Error('Betting window has closed');
      const bet = await Bet.create(
        [
          {
            userId: new mongoose.Types.ObjectId(userId),
            roundId: new mongoose.Types.ObjectId(roundId),
            prediction,
            amount,
            status: 'placed',
            payoutMultiplier: config.payoutMultiplier,
            payoutAmount: 0,
          },
        ],
        { session }
      );
      result.betId = bet[0]._id.toString();
      await lockForBet(userId, amount, result.betId, session);
      await Round.updateOne(
        { _id: roundId },
        { $inc: { totalBetAmount: amount } },
        { session }
      );
    });
    const current = await getCurrentRound();
    if (current && current._id.toString() === roundId) {
      (current as { totalBetAmount?: number }).totalBetAmount = ((current as { totalBetAmount?: number }).totalBetAmount ?? 0) + amount;
    }
    logWithContext('info', 'Bet placed', { userId, roundId, betId: result.betId, amount });
    auditLog('bet_placed', { userId, metadata: { roundId, betId: result.betId, prediction, amount } });
    emitBetConfirmed(userId, { betId: result.betId, roundId, prediction, amount });
    return { betId: result.betId, roundId, prediction, amount };
  } finally {
    await session.endSession();
  }
}

export async function getBetsByUserId(userId: string, page: number = 1, limit: number = 50) {
  const skip = (page - 1) * limit;
  const bets = await Bet.find({ userId })
    .populate('roundId', 'roundNumber status result settledAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  const total = await Bet.countDocuments({ userId });
  return { items: bets, total, page, limit };
}
