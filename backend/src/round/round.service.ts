import mongoose from 'mongoose';
import { Round, Bet, DailyStats } from '../models/index.js';
import { readPreferenceSecondaryPreferred } from '../db/mongo.js';
import { config } from '../config/index.js';
import { getMongoSession, runTransaction } from '../db/mongo.js';
import { generateServerSeed, hashServerSeed, computeResult } from '../game/provablyFair.js';
import { settleBet, recordWagerAndBonusProgress } from '../wallet/wallet.service.js';
import { logWithContext } from '../logs/index.js';
import { cacheGet, cacheSet, cacheDel, CACHE_KEYS } from '../cache/index.js';

type RoundDoc = { _id: mongoose.Types.ObjectId; roundNumber: number; status: string; bettingClosesAt: Date; serverSeedHash: string; result?: number; serverSeed?: string; totalBetAmount: number };
/** In-memory cache for the current round; cleared when round settles. Avoids hitting Mongo on every timer tick. */
let currentRoundCache: { id: string; doc: RoundDoc } | null = null;

function roundDocFromCached(c: { _id: string; roundNumber: number; status: string; bettingClosesAt: string; serverSeedHash: string; totalBetAmount: number; result?: number; serverSeed?: string }): RoundDoc {
  return {
    _id: new mongoose.Types.ObjectId(c._id),
    roundNumber: c.roundNumber,
    status: c.status,
    bettingClosesAt: new Date(c.bettingClosesAt),
    serverSeedHash: c.serverSeedHash,
    totalBetAmount: c.totalBetAmount,
    ...(c.result !== undefined && { result: c.result }),
    ...(c.serverSeed !== undefined && { serverSeed: c.serverSeed }),
  };
}

export function getCurrentRoundFromCache() {
  return currentRoundCache;
}

export function setCurrentRoundCache(round: RoundDoc | null) {
  currentRoundCache = round ? { id: round._id.toString(), doc: round } : null;
  if (round) {
    const payload = {
      _id: round._id.toString(),
      roundNumber: round.roundNumber,
      status: round.status,
      bettingClosesAt: round.bettingClosesAt.toISOString(),
      serverSeedHash: round.serverSeedHash,
      totalBetAmount: round.totalBetAmount,
      ...(round.result !== undefined && { result: round.result }),
      ...(round.serverSeed !== undefined && { serverSeed: round.serverSeed }),
    };
    cacheSet(CACHE_KEYS.roundPrediction, payload, config.cacheTtlRoundStateMs).catch(() => {});
  } else {
    cacheDel(CACHE_KEYS.roundPrediction).catch(() => {});
  }
}

export async function getCurrentRound(): Promise<RoundDoc | null> {
  if (currentRoundCache) return currentRoundCache.doc;
  const cached = await cacheGet<{ _id: string; roundNumber: number; status: string; bettingClosesAt: string; serverSeedHash: string; totalBetAmount: number; result?: number; serverSeed?: string }>(CACHE_KEYS.roundPrediction);
  if (cached) return roundDocFromCached(cached);
  const start = Date.now();
  const round = await Round.findOne({ status: { $in: ['betting', 'closed'] } })
    .sort({ roundNumber: -1 })
    .read(readPreferenceSecondaryPreferred)
    .lean();
  const durationMs = Date.now() - start;
  if (durationMs > config.slowQueryMs) {
    logWithContext('warn', 'Slow getCurrentRound (cache miss)', { durationMs });
  }
  if (round) {
    const doc = round as RoundDoc;
    currentRoundCache = { id: doc._id.toString(), doc };
    const payload = {
      _id: doc._id.toString(),
      roundNumber: doc.roundNumber,
      status: doc.status,
      bettingClosesAt: doc.bettingClosesAt.toISOString(),
      serverSeedHash: doc.serverSeedHash,
      totalBetAmount: doc.totalBetAmount,
      ...(doc.result !== undefined && { result: doc.result }),
      ...(doc.serverSeed !== undefined && { serverSeed: doc.serverSeed }),
    };
    cacheSet(CACHE_KEYS.roundPrediction, payload, config.cacheTtlRoundStateMs).catch(() => {});
    return doc;
  }
  return null;
}

export async function createNextRound(): Promise<{ _id: mongoose.Types.ObjectId; roundNumber: number; status: string; startedAt: Date; bettingClosesAt: Date; serverSeedHash: string; totalBetAmount: number }> {
  const last = await Round.findOne().sort({ roundNumber: -1 }).select('roundNumber').lean();
  const roundNumber = last ? last.roundNumber + 1 : 1;
  const serverSeed = generateServerSeed();
  const serverSeedHash = hashServerSeed(serverSeed);
  const startedAt = new Date();
  const bettingClosesAt = new Date(startedAt.getTime() + config.bettingWindowMs);
  const round = await Round.create([
    {
      roundNumber,
      status: 'betting',
      totalBetAmount: 0,
      startedAt,
      bettingClosesAt,
      serverSeed,
      serverSeedHash,
    },
  ]);
  const doc = round[0];
  setCurrentRoundCache({
    _id: doc._id,
    roundNumber: doc.roundNumber,
    status: doc.status,
    bettingClosesAt: doc.bettingClosesAt,
    serverSeedHash: doc.serverSeedHash,
    totalBetAmount: doc.totalBetAmount,
  });
  logWithContext('info', 'Round created', { roundId: doc._id.toString(), roundNumber });
  return {
    _id: doc._id,
    roundNumber: doc.roundNumber,
    status: doc.status,
    startedAt: doc.startedAt,
    bettingClosesAt: doc.bettingClosesAt,
    serverSeedHash: doc.serverSeedHash,
    totalBetAmount: doc.totalBetAmount,
  };
}

export async function closeBetting(roundId: string): Promise<boolean> {
  const session = await getMongoSession();
  try {
    let closed = false;
    await runTransaction(session, async () => {
      const round = await Round.findById(roundId).session(session);
      if (!round) return;
      if (round.status !== 'betting') return;
      if (Date.now() < round.bettingClosesAt.getTime()) return;
      await Round.updateOne({ _id: round._id }, { $set: { status: 'closed' } }, { session });
      closed = true;
      setCurrentRoundCache({
        _id: round._id,
        roundNumber: round.roundNumber,
        status: 'closed',
        bettingClosesAt: round.bettingClosesAt,
        serverSeedHash: round.serverSeedHash,
        totalBetAmount: round.totalBetAmount,
      });
    });
    if (closed) logWithContext('info', 'Round closed', { roundId });
    return closed;
  } finally {
    await session.endSession();
  }
}

export async function generateAndPersistResult(roundId: string): Promise<{ result: number; serverSeed: string } | null> {
  const round = await Round.findById(roundId).lean();
  if (!round || round.status !== 'closed') return null;
  const result = computeResult(round.serverSeed, round.roundNumber);
  const settledAt = new Date();
  await Round.updateOne(
    { _id: roundId },
    { $set: { result, settledAt, status: 'settled' } }
  );
  setCurrentRoundCache(null);
  logWithContext('info', 'Round result generated', { roundId, result });
  return { result, serverSeed: round.serverSeed };
}

/**
 * Settle all bets for a closed round in one transaction. Double-settlement guarded by status.
 */
export async function settleRound(roundId: string): Promise<{ result: number; serverSeed: string; affectedUserIds: string[] } | null> {
  const round = await Round.findById(roundId).lean();
  if (!round) return null;
  if (round.status === 'settled') return null; // Defense in depth: prevent double settlement after restart
  if (round.status !== 'closed') return null;
  const result = computeResult(round.serverSeed, round.roundNumber);
  const settledAt = new Date();
  const bets = await Bet.find({ roundId: round._id, status: 'placed' }).lean();
  const multiplier = config.payoutMultiplier;
  const session = await getMongoSession();
  const affectedUserIds: string[] = [];
  try {
    await runTransaction(session, async () => {
      await Round.updateOne(
        { _id: roundId, status: 'closed' },
        { $set: { result, settledAt, status: 'settled' } },
        { session }
      );
      for (const bet of bets) {
        const won = bet.prediction === result;
        const payoutAmount = won ? bet.amount * (multiplier + 1) : 0;
        await settleBet(
          bet.userId.toString(),
          bet.amount,
          payoutAmount,
          bet._id.toString(),
          session
        );
        await recordWagerAndBonusProgress(bet.userId.toString(), bet.amount, session);
        await Bet.updateOne(
          { _id: bet._id },
          { $set: { status: won ? 'won' : 'lost', payoutAmount } },
          { session }
        );
        affectedUserIds.push(bet.userId.toString());
      }
      const roundTotalBetVolume = bets.reduce((s, b) => s + b.amount, 0);
      const roundTotalPayout = bets.reduce(
        (s, b) => s + (b.prediction === result ? b.amount * (multiplier + 1) : 0),
        0
      );
      const dateStr = new Date().toISOString().slice(0, 10);
      const updated = await DailyStats.findOneAndUpdate(
        { date: dateStr },
        { $inc: { totalBetVolume: roundTotalBetVolume, totalPayout: roundTotalPayout } },
        { upsert: true, new: true, session }
      );
      if (updated) {
        await DailyStats.updateOne(
          { date: dateStr },
          { $set: { netRevenue: updated.totalBetVolume - updated.totalPayout } },
          { session }
        );
      }
    });
    setCurrentRoundCache(null);
    logWithContext('info', 'Round settled', { roundId, result, betCount: bets.length });
    return { result, serverSeed: round.serverSeed, affectedUserIds };
  } finally {
    await session.endSession();
  }
}
