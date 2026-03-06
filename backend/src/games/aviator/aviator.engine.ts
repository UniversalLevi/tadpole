import mongoose from 'mongoose';
import { AviatorBet, AviatorRound } from '../../models/index.js';
import { generateServerSeed, hashServerSeed, computeCrashPoint } from '../../game/provablyFair.js';
import { getMongoSession, runTransaction } from '../../db/mongo.js';
import { getWallet, settleBet } from '../../wallet/wallet.service.js';
import { emitWalletUpdate } from '../../engine/emitters.js';
import { addSettlementJob } from '../../queue/settlement.queue.js';
import { logWithContext } from '../../logs/index.js';
import type { GameEngine } from '../../engine/types.js';

export type AviatorPhase = 'countdown' | 'betting' | 'running' | 'crashed' | 'idle';

type AviatorState = {
  phase: AviatorPhase;
  roundId: string | null;
  roundNumber: number;
  serverSeedHash: string | null;
  crashPoint: number | null;
  bettingClosesAt: number | null;
  runningStartedAt: number | null;
  crashedAt: number | null;
  currentMultiplier: number;
};

const DEFAULTS = {
  countdownMs: 3000,
  bettingMs: 5000,
  tickMs: 50, // 20Hz
  growthRate: 0.08,
  postCrashGapMs: 3000,
  maxCrashPoint: 100,
} as const;

let state: AviatorState = {
  phase: 'idle',
  roundId: null,
  roundNumber: 0,
  serverSeedHash: null,
  crashPoint: null,
  bettingClosesAt: null,
  runningStartedAt: null,
  crashedAt: null,
  currentMultiplier: 1,
};

let countdownTimer: ReturnType<typeof setTimeout> | null = null;
let phaseTimer: ReturnType<typeof setTimeout> | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;

// In-memory active bets cache for auto-cashout checks.
type ActiveBet = { betId: string; userId: string; betAmount: number; autoCashout?: number };
let activeBets: Map<string, ActiveBet> = new Map();

export function getAviatorState(): AviatorState {
  return { ...state };
}

export function cacheActiveBet(bet: ActiveBet): void {
  activeBets.set(bet.betId, bet);
}

export function removeCachedBet(betId: string): void {
  activeBets.delete(betId);
}

export async function cashoutBet(userId: string, betId: string): Promise<{ payout: number; multiplier: number }> {
  const multiplier = state.currentMultiplier;
  await internalCashout(userId, betId);
  // internalCashout already used the snapshot multiplier (same tick), return it for API response.
  const bet = await AviatorBet.findById(betId).select('payout').lean();
  return { payout: (bet?.payout as number) ?? 0, multiplier };
}

export type AviatorEmitters = {
  countdown?: (payload: { msRemaining: number }) => void;
  roundStarted?: (payload: { roundId: string; roundNumber: number; bettingClosesAt: Date; serverSeedHash: string }) => void;
  tick?: (payload: { roundId: string; multiplier: number }) => void;
  crashed?: (payload: { roundId: string; crashPoint: number; serverSeed: string }) => void;
};

let emitters: Required<AviatorEmitters> = {
  countdown: () => {},
  roundStarted: () => {},
  tick: () => {},
  crashed: () => {},
};

export function setAviatorEmitters(next: AviatorEmitters): void {
  emitters = { ...emitters, ...next };
}

function resetTimers(): void {
  if (countdownTimer) clearTimeout(countdownTimer);
  if (phaseTimer) clearTimeout(phaseTimer);
  if (tickInterval) clearInterval(tickInterval);
  countdownTimer = null;
  phaseTimer = null;
  tickInterval = null;
}

async function createBettingRound(): Promise<{ roundId: string; roundNumber: number; bettingClosesAt: Date; serverSeedHash: string; serverSeed: string; crashPoint: number }> {
  const last = await AviatorRound.findOne().sort({ roundNumber: -1 }).select('roundNumber').lean();
  const roundNumber = last ? (last.roundNumber as number) + 1 : 1;
  const serverSeed = generateServerSeed();
  const serverSeedHash = hashServerSeed(serverSeed);
  const crashPoint = computeCrashPoint(serverSeed, roundNumber, DEFAULTS.maxCrashPoint);
  const startedAt = new Date();
  const bettingClosesAt = new Date(startedAt.getTime() + DEFAULTS.bettingMs);
  const [doc] = await AviatorRound.create([
    {
      roundNumber,
      crashPoint,
      serverSeed,
      serverSeedHash,
      status: 'betting',
      startedAt,
      bettingClosesAt,
    },
  ]);
  return { roundId: doc._id.toString(), roundNumber, bettingClosesAt: doc.bettingClosesAt, serverSeedHash, serverSeed, crashPoint };
}

function computeMultiplier(nowMs: number): number {
  if (!state.runningStartedAt) return 1;
  const elapsedSec = Math.max(0, (nowMs - state.runningStartedAt) / 1000);
  const m = Math.exp(DEFAULTS.growthRate * elapsedSec);
  return Math.max(1, Math.floor(m * 100) / 100);
}

async function loadActiveBetsIntoMemory(roundId: string): Promise<void> {
  const items = await AviatorBet.find({ roundId: new mongoose.Types.ObjectId(roundId), status: 'active' })
    .select('userId betAmount autoCashout')
    .lean();
  activeBets = new Map(
    items.map((b) => [
      b._id.toString(),
      { betId: b._id.toString(), userId: b.userId.toString(), betAmount: b.betAmount as number, autoCashout: (b.autoCashout as number | undefined) },
    ])
  );
}

function beginTicking(): void {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(async () => {
    try {
      const roundId = state.roundId;
      const crashPoint = state.crashPoint;
      if (state.phase !== 'running' || !roundId || crashPoint == null) return;
      const now = Date.now();
      const multiplier = computeMultiplier(now);
      state = { ...state, currentMultiplier: multiplier };
      emitters.tick({ roundId, multiplier });

      // Auto cashouts (in-memory only; DB writes happen via API-level logic later)
      // For MVP, auto cashout is handled by calling internal cashout logic here.
      for (const b of activeBets.values()) {
        if (b.autoCashout != null && multiplier >= b.autoCashout) {
          // Fire-and-forget; any errors are logged.
          internalCashout(b.userId, b.betId).catch((e) => {
            logWithContext('warn', 'Auto cashout failed', { betId: b.betId, error: e instanceof Error ? e.message : String(e) });
          });
        }
      }

      if (multiplier >= crashPoint) {
        await crashRound();
      }
    } catch (e) {
      logWithContext('error', 'Aviator tick error', { error: e instanceof Error ? e.message : String(e) });
    }
  }, DEFAULTS.tickMs);
}

async function enterRunningFromBetting(roundId: string): Promise<void> {
  const runningStartedAt = Date.now();
  await AviatorRound.updateOne(
    { _id: new mongoose.Types.ObjectId(roundId), status: 'betting' },
    { $set: { status: 'running', runningStartedAt: new Date(runningStartedAt) } }
  );
  state = { ...state, phase: 'running', roundId, runningStartedAt, currentMultiplier: 1 };
  await loadActiveBetsIntoMemory(roundId);
  beginTicking();
}

async function resumeRunning(roundId: string, runningStartedAt: number): Promise<void> {
  state = { ...state, phase: 'running', roundId, runningStartedAt, currentMultiplier: computeMultiplier(Date.now()) };
  await loadActiveBetsIntoMemory(roundId);
  beginTicking();
}

async function crashRound(): Promise<void> {
  if (!state.roundId) return;
  const roundId = state.roundId;
  const round = await AviatorRound.findById(roundId).lean();
  if (!round || round.status !== 'running') return;

  const crashedAt = new Date();
  await AviatorRound.updateOne({ _id: round._id }, { $set: { status: 'crashed', crashedAt } });

  state = {
    ...state,
    phase: 'crashed',
    crashedAt: crashedAt.getTime(),
    currentMultiplier: state.crashPoint ?? state.currentMultiplier,
  };

  emitters.crashed({ roundId, crashPoint: round.crashPoint as number, serverSeed: round.serverSeed as string });

  // Settle remaining active bets as lost (no payout)
  const session = await getMongoSession();
  const affectedUserIds: string[] = [];
  try {
    await runTransaction(session, async () => {
      const active = await AviatorBet.find({ roundId: round._id, status: 'active' }).session(session);
      for (const bet of active) {
        affectedUserIds.push(bet.userId.toString());
        await AviatorBet.updateOne({ _id: bet._id, status: 'active' }, { $set: { status: 'lost', payout: 0 } }, { session });
        await settleBet(bet.userId.toString(), bet.betAmount, 0, bet._id.toString(), session);
      }
    });
  } finally {
    await session.endSession();
  }
  activeBets.clear();
  addSettlementJob(roundId, 'aviator', affectedUserIds);

  // Gap then next countdown
  resetTimers();
  phaseTimer = setTimeout(() => {
    void startCountdown();
  }, DEFAULTS.postCrashGapMs);
}

async function internalCashout(userId: string, betId: string): Promise<void> {
  if (state.phase !== 'running' || !state.roundId || !state.crashPoint) throw new Error('Round not running');
  const multiplier = state.currentMultiplier;
  if (multiplier >= state.crashPoint) throw new Error('Crash already occurred');
  const session = await getMongoSession();
  try {
    await runTransaction(session, async () => {
      const bet = await AviatorBet.findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(betId), userId: new mongoose.Types.ObjectId(userId), status: 'active' },
        { $set: { status: 'cashed_out', cashoutMultiplier: multiplier } },
        { new: true, session }
      );
      if (!bet) throw new Error('Bet not active');
      const payout = Math.floor(bet.betAmount * multiplier * 100) / 100;
      await AviatorBet.updateOne({ _id: bet._id }, { $set: { payout } }, { session });
      await settleBet(userId, bet.betAmount, payout, bet._id.toString(), session);
    });
  } finally {
    await session.endSession();
  }
  activeBets.delete(betId);
  const w = await getWallet(userId);
  if (w) emitWalletUpdate(userId, { availableBalance: w.availableBalance, lockedBalance: w.lockedBalance });
}

async function startCountdown(): Promise<void> {
  resetTimers();
  state = { ...state, phase: 'countdown', roundId: null, crashPoint: null, serverSeedHash: null, bettingClosesAt: null, runningStartedAt: null, crashedAt: null, currentMultiplier: 1 };
  emitters.countdown({ msRemaining: DEFAULTS.countdownMs });
  countdownTimer = setTimeout(() => {
    void startBettingPhase();
  }, DEFAULTS.countdownMs);
}

async function startBettingPhase(): Promise<void> {
  const round = await createBettingRound();
  state = {
    ...state,
    phase: 'betting',
    roundId: round.roundId,
    roundNumber: round.roundNumber,
    serverSeedHash: round.serverSeedHash,
    crashPoint: round.crashPoint,
    bettingClosesAt: round.bettingClosesAt.getTime(),
    runningStartedAt: null,
    crashedAt: null,
    currentMultiplier: 1,
  };
  emitters.roundStarted({ roundId: round.roundId, roundNumber: round.roundNumber, bettingClosesAt: round.bettingClosesAt, serverSeedHash: round.serverSeedHash });
  phaseTimer = setTimeout(() => {
    if (!state.roundId) return;
    void enterRunningFromBetting(state.roundId);
  }, DEFAULTS.bettingMs);
}

async function recoverAviatorOnStartup(): Promise<void> {
  const round = await AviatorRound.findOne({ status: { $in: ['betting', 'running'] } }).sort({ roundNumber: -1 }).lean();
  if (!round) {
    await startCountdown();
    return;
  }
  const roundId = round._id.toString();
  const bettingClosesAt = new Date(round.bettingClosesAt as Date).getTime();
  const now = Date.now();

  state = {
    phase: round.status === 'betting' ? 'betting' : 'running',
    roundId,
    roundNumber: round.roundNumber as number,
    serverSeedHash: round.serverSeedHash as string,
    crashPoint: round.crashPoint as number,
    bettingClosesAt,
    runningStartedAt: round.runningStartedAt ? new Date(round.runningStartedAt as Date).getTime() : null,
    crashedAt: null,
    currentMultiplier: 1,
  };

  if (round.status === 'betting') {
    const msLeft = Math.max(0, bettingClosesAt - now);
    emitters.roundStarted({ roundId, roundNumber: round.roundNumber as number, bettingClosesAt: new Date(bettingClosesAt), serverSeedHash: round.serverSeedHash as string });
    phaseTimer = setTimeout(() => void enterRunningFromBetting(roundId), msLeft);
    return;
  }

  if (round.status === 'running') {
    const runningStartedAt = state.runningStartedAt ?? now;
    const multiplier = computeMultiplier(now);
    state = { ...state, phase: 'running', runningStartedAt, currentMultiplier: multiplier };
    if (state.crashPoint != null && multiplier >= state.crashPoint) {
      await crashRound();
      return;
    }
    await resumeRunning(roundId, runningStartedAt);
  }
}

function startAviator(): void {
  void startCountdown();
  logWithContext('info', 'Aviator engine started');
}

function stopAviator(): void {
  resetTimers();
  state = { ...state, phase: 'idle' };
  activeBets.clear();
}

export const aviatorEngine: GameEngine = {
  id: 'aviator',
  start: startAviator,
  stop: stopAviator,
  recoverOnStartup: recoverAviatorOnStartup,
};

