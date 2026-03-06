import { Round } from '../../models/index.js';
import { config } from '../../config/index.js';
import { getSystemConfig } from '../../models/SystemConfig.js';
import {
  getCurrentRound,
  createNextRound,
  closeBetting,
  settleRound,
  setCurrentRoundCache,
} from '../../round/round.service.js';
import { logWithContext } from '../../logs/index.js';
import { emitPredictionRoundStarted, emitPredictionRoundTimer, emitPredictionRoundClosed, emitPredictionRoundResult } from '../../engine/emitters.js';
import { addSettlementJob } from '../../queue/settlement.queue.js';
import type { GameEngine } from '../../engine/types.js';

/** Restart recovery: close or settle any stuck prediction round. */
async function recoverPredictionOnStartup(): Promise<void> {
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
      emitPredictionRoundResult({ roundId: round._id.toString(), result: result.result, serverSeed: result.serverSeed });
      addSettlementJob(round._id.toString(), 'prediction', result.affectedUserIds);
    }
  }
}

let tickInterval: ReturnType<typeof setInterval> | null = null;
let lastClosedRoundId: string | null = null;
let lastClosedAt: number = 0;
let lastSettledAt: number = 0;

function startPrediction(): void {
  if (tickInterval) return;
  tickInterval = setInterval(async () => {
    try {
      let round = await getCurrentRound();
      if (!round) {
        const sys = await getSystemConfig();
        if (sys.newRoundsPaused) return;
        const now = Date.now();
        const gapMs = config.roundGapAfterSettleMs;
        if (lastSettledAt && now - lastSettledAt < gapMs) return;
        const created = await createNextRound();
        emitPredictionRoundStarted({
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
        emitPredictionRoundTimer({ roundId, secondsRemaining });
        if (now >= closesAt) {
          await closeBetting(roundId);
          emitPredictionRoundClosed({ roundId });
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
            lastSettledAt = Date.now();
            emitPredictionRoundResult({ roundId, result: result.result, serverSeed: result.serverSeed });
            addSettlementJob(roundId, 'prediction', result.affectedUserIds);
          }
          lastClosedRoundId = null;
        }
      }
    } catch (e) {
      logWithContext('error', 'Prediction engine tick error', { error: e instanceof Error ? e.message : String(e) });
    }
  }, 1000);
  logWithContext('info', 'Prediction engine started');
}

function stopPrediction(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

export const predictionEngine: GameEngine = {
  id: 'prediction',
  start: startPrediction,
  stop: stopPrediction,
  recoverOnStartup: recoverPredictionOnStartup,
};

