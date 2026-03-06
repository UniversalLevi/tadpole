import mongoose from 'mongoose';
import { AviatorBet, AviatorRound, User } from '../../models/index.js';
import { config } from '../../config/index.js';
import { getMongoSession, runTransaction } from '../../db/mongo.js';
import { lockForBet } from '../../wallet/wallet.service.js';
import { logWithContext } from '../../logs/index.js';
import { cacheActiveBet, cashoutBet, getAviatorState, removeCachedBet } from './aviator.engine.js';
import { cacheGet, cacheSet, CACHE_KEYS } from '../../cache/index.js';

export type RoundPlayersResponse = {
  activeCount: number;
  recentCashouts: Array<{ multiplier: number; payout: number }>;
};

export type AviatorPublicState = {
  phase: string;
  roundId: string | null;
  roundNumber: number;
  bettingClosesAt: string | null;
  serverSeedHash: string | null;
  multiplier: number;
  crashed?: { crashPoint: number; serverSeed: string };
};

export async function getAviatorPublicState(): Promise<AviatorPublicState> {
  const cached = await cacheGet<AviatorPublicState>(CACHE_KEYS.roundAviator);
  if (cached) return cached;
  const s = getAviatorState();
  let result: AviatorPublicState;
  if (!s.roundId) {
    result = {
      phase: s.phase,
      roundId: null,
      roundNumber: 0,
      bettingClosesAt: null,
      serverSeedHash: null,
      multiplier: 1,
    };
  } else if (s.phase === 'crashed') {
    const round = await AviatorRound.findById(s.roundId).select('crashPoint serverSeed').lean();
    result = {
      phase: s.phase,
      roundId: s.roundId,
      roundNumber: s.roundNumber,
      bettingClosesAt: s.bettingClosesAt ? new Date(s.bettingClosesAt).toISOString() : null,
      serverSeedHash: s.serverSeedHash,
      multiplier: s.currentMultiplier,
      crashed: round ? { crashPoint: round.crashPoint as number, serverSeed: round.serverSeed as string } : undefined,
    };
  } else {
    result = {
      phase: s.phase,
      roundId: s.roundId,
      roundNumber: s.roundNumber,
      bettingClosesAt: s.bettingClosesAt ? new Date(s.bettingClosesAt).toISOString() : null,
      serverSeedHash: s.serverSeedHash,
      multiplier: s.currentMultiplier,
    };
  }
  await cacheSet(CACHE_KEYS.roundAviator, result, config.cacheTtlRoundStateMs);
  return result;
}

export async function getRoundPlayers(): Promise<RoundPlayersResponse> {
  const s = getAviatorState();
  if (!s.roundId) return { activeCount: 0, recentCashouts: [] };
  const [activeCount, cashouts] = await Promise.all([
    AviatorBet.countDocuments({ roundId: new mongoose.Types.ObjectId(s.roundId), status: 'active' }),
    AviatorBet.find({ roundId: new mongoose.Types.ObjectId(s.roundId), status: 'cashed_out' })
      .sort({ updatedAt: -1 })
      .limit(15)
      .select('cashoutMultiplier payout')
      .lean(),
  ]);
  return {
    activeCount,
    recentCashouts: cashouts.map((b) => ({ multiplier: b.cashoutMultiplier as number, payout: b.payout as number })),
  };
}

export async function listLastCrashes(limit: number): Promise<Array<{ roundNumber: number; crashPoint: number; crashedAt: Date }>> {
  const n = Math.min(50, Math.max(1, limit));
  const rows = await AviatorRound.find({ status: 'crashed' })
    .sort({ roundNumber: -1 })
    .limit(n)
    .select('roundNumber crashPoint crashedAt')
    .lean();
  return rows.map((r) => ({
    roundNumber: r.roundNumber as number,
    crashPoint: r.crashPoint as number,
    crashedAt: (r.crashedAt as Date) ?? new Date(),
  }));
}

export async function placeAviatorBet(userId: string, betAmount: number, autoCashout?: number): Promise<{ betId: string; roundId: string; roundNumber: number }> {
  const s = getAviatorState();
  if (s.phase !== 'betting' || !s.roundId || !s.bettingClosesAt) throw new Error('Betting is closed');
  if (Date.now() >= s.bettingClosesAt) throw new Error('Betting window has closed');
  if (betAmount < config.minBetAmount || betAmount > config.maxBetAmount) {
    throw new Error(`Bet must be between ${config.minBetAmount} and ${config.maxBetAmount} INR`);
  }
  if (autoCashout != null && autoCashout < 1.01) throw new Error('Auto cashout must be >= 1.01x');

  const user = await User.findById(userId).select('isFrozen').lean();
  if (!user) throw new Error('User not found');
  if (user.isFrozen) throw new Error('Account is frozen');

  const session = await getMongoSession();
  let betId = '';
  try {
    await runTransaction(session, async () => {
      const [bet] = await AviatorBet.create(
        [
          {
            userId: new mongoose.Types.ObjectId(userId),
            roundId: new mongoose.Types.ObjectId(s.roundId!),
            betAmount,
            autoCashout: autoCashout || undefined,
            status: 'active',
            payout: 0,
          },
        ],
        { session }
      );
      betId = bet._id.toString();
      await lockForBet(userId, betAmount, betId, session);
    });
  } finally {
    await session.endSession();
  }
  cacheActiveBet({ betId, userId, betAmount, autoCashout });
  logWithContext('info', 'Aviator bet placed', { userId, betId, roundId: s.roundId, betAmount, autoCashout });
  return { betId, roundId: s.roundId, roundNumber: s.roundNumber };
}

export async function cashoutAviatorBet(userId: string, betId: string): Promise<{ payout: number; multiplier: number }> {
  const result = await cashoutBet(userId, betId);
  removeCachedBet(betId);
  logWithContext('info', 'Aviator cashed out', { userId, betId, payout: result.payout, multiplier: result.multiplier });
  return result;
}

