import { Round } from '../models/index.js';
import { config } from '../config/index.js';
import { getSystemConfig } from '../models/SystemConfig.js';
import {
  getCurrentRound,
  createNextRound,
  closeBetting,
  settleRound,
  setCurrentRoundCache,
} from '../round/round.service.js';
import { logWithContext } from '../logs/index.js';

export type EmitRoundStarted = (payload: { roundId: string; roundNumber: number; bettingClosesAt: Date; serverSeedHash: string }) => void;
export type EmitRoundTimer = (payload: { roundId: string; secondsRemaining: number }) => void;
export type EmitRoundClosed = (payload: { roundId: string }) => void;
export type EmitRoundResult = (payload: { roundId: string; result: number; serverSeed: string }) => void;
export type EmitWalletUpdate = (userId: string, payload: { availableBalance: number; lockedBalance: number }) => void;

let emitRoundStarted: EmitRoundStarted = () => {};
let emitRoundTimer: EmitRoundTimer = () => {};
let emitRoundClosed: EmitRoundClosed = () => {};
let emitRoundResult: EmitRoundResult = () => {};
let emitWalletUpdate: EmitWalletUpdate = () => {};

export function setSchedulerEmitters(emitters: {
  roundStarted?: EmitRoundStarted;
  roundTimer?: EmitRoundTimer;
  roundClosed?: EmitRoundClosed;
  roundResult?: EmitRoundResult;
  walletUpdate?: EmitWalletUpdate;
}) {
  if (emitters.roundStarted) emitRoundStarted = emitters.roundStarted;
  if (emitters.roundTimer) emitRoundTimer = emitters.roundTimer;
  if (emitters.roundClosed) emitRoundClosed = emitters.roundClosed;
  if (emitters.roundResult) emitRoundResult = emitters.roundResult;
  if (emitters.walletUpdate) emitWalletUpdate = emitters.walletUpdate;
}

/** Restart recovery: close or settle any stuck round. */
export async function recoverRoundOnStartup(): Promise<void> {
  const round = await Round.findOne({ status: { $in: ['betting', 'closed'] } }).sort({ roundNumber: -1 }).lean();
  if (!round) return;
  const now = Date.now();
  setCurrentRoundCache(round as Parameters<typeof setCurrentRoundCache>[0]);
  if (round.status === 'betting' && now >= new Date(round.bettingClosesAt).getTime()) {
    await closeBetting(round._id.toString());
    logWithContext('info', 'Recovery: closed stuck betting round', { roundId: round._id.toString() });
  }
  if (round.status === 'closed') {
    const result = await settleRound(round._id.toString());
    if (result) {
      logWithContext('info', 'Recovery: settled stuck closed round', { roundId: round._id.toString() });
      emitRoundResult({ roundId: round._id.toString(), result: result.result, serverSeed: result.serverSeed });
      const { getWallet } = await import('../wallet/wallet.service.js');
      for (const uid of result.affectedUserIds) {
        const w = await getWallet(uid);
        if (w) emitWalletUpdate(uid, { availableBalance: w.availableBalance, lockedBalance: w.lockedBalance });
      }
    }
  }
}

let tickInterval: ReturnType<typeof setInterval> | null = null;
let lastClosedRoundId: string | null = null;
let lastClosedAt: number = 0;

export function startRoundScheduler(): void {
  if (tickInterval) return;
  tickInterval = setInterval(async () => {
    try {
      let round = await getCurrentRound();
      if (!round) {
        const sys = await getSystemConfig();
        if (sys.newRoundsPaused) return;
        const created = await createNextRound();
        emitRoundStarted({
          roundId: created._id.toString(),
          roundNumber: created.roundNumber,
          bettingClosesAt: created.bettingClosesAt,
          serverSeedHash: created.serverSeedHash,
        });
        return;
      }
      const roundId = round._id.toString();
      const now = Date.now();
      const closesAt = new Date(round.bettingClosesAt).getTime();
      if (round.status === 'betting') {
        const secondsRemaining = Math.max(0, Math.ceil((closesAt - now) / 1000));
        emitRoundTimer({ roundId, secondsRemaining });
        if (now >= closesAt) {
          await closeBetting(roundId);
          emitRoundClosed({ roundId });
          lastClosedRoundId = roundId;
          lastClosedAt = now;
        }
        return;
      }
      if (round.status === 'closed') {
        if (lastClosedRoundId !== roundId) {
          lastClosedRoundId = roundId;
          lastClosedAt = now;
        }
        const elapsed = now - lastClosedAt;
        if (elapsed >= config.closingBufferMs) {
          const result = await settleRound(roundId);
          if (result) {
            emitRoundResult({ roundId, result: result.result, serverSeed: result.serverSeed });
            const { getWallet } = await import('../wallet/wallet.service.js');
            for (const uid of result.affectedUserIds) {
              const w = await getWallet(uid);
              if (w) emitWalletUpdate(uid, { availableBalance: w.availableBalance, lockedBalance: w.lockedBalance });
            }
          }
          lastClosedRoundId = null;
        }
      }
    } catch (e) {
      logWithContext('error', 'Round scheduler tick error', { error: e instanceof Error ? e.message : String(e) });
    }
  }, 1000);
  logWithContext('info', 'Round scheduler started');
}

export function stopRoundScheduler(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}
