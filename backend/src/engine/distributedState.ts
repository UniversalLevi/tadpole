/**
 * Redis-backed state for a future distributed game engine (Option 2).
 * When moving to multiple engine instances, use these helpers so round state
 * and active bets are shared via Redis instead of in-process memory.
 * Current aviator engine does not use this; it remains in-process until Option 2 is adopted.
 */
import { getCacheRedis } from '../cache/redisClient.js';

const TTL_STATE_MS = 5 * 60 * 1000; // 5 min
const TTL_BETS_MS = 10 * 60 * 1000; // 10 min
const PREFIX = 'engine:aviator';

function stateKey(roundId: string): string {
  return `${PREFIX}:round:${roundId}:state`;
}

function betsKey(roundId: string): string {
  return `${PREFIX}:round:${roundId}:bets`;
}

export type AviatorRoundStatePayload = {
  phase: string;
  roundId: string;
  roundNumber: number;
  serverSeedHash: string | null;
  crashPoint: number | null;
  bettingClosesAt: number | null;
  runningStartedAt: number | null;
  currentMultiplier: number;
};

export async function setAviatorRoundState(roundId: string, state: AviatorRoundStatePayload): Promise<boolean> {
  const client = getCacheRedis();
  if (!client) return false;
  try {
    await client.set(stateKey(roundId), JSON.stringify(state), 'PX', TTL_STATE_MS);
    return true;
  } catch {
    return false;
  }
}

export async function getAviatorRoundState(roundId: string): Promise<AviatorRoundStatePayload | null> {
  const client = getCacheRedis();
  if (!client) return null;
  try {
    const raw = await client.get(stateKey(roundId));
    if (!raw) return null;
    return JSON.parse(raw) as AviatorRoundStatePayload;
  } catch {
    return null;
  }
}

export type ActiveBetPayload = { betId: string; userId: string; betAmount: number; autoCashout?: number };

export async function setAviatorActiveBets(roundId: string, bets: ActiveBetPayload[]): Promise<boolean> {
  const client = getCacheRedis();
  if (!client) return false;
  try {
    await client.set(betsKey(roundId), JSON.stringify(bets), 'PX', TTL_BETS_MS);
    return true;
  } catch {
    return false;
  }
}

export async function getAviatorActiveBets(roundId: string): Promise<ActiveBetPayload[]> {
  const client = getCacheRedis();
  if (!client) return [];
  try {
    const raw = await client.get(betsKey(roundId));
    if (!raw) return [];
    return JSON.parse(raw) as ActiveBetPayload[];
  } catch {
    return [];
  }
}

export async function deleteAviatorRoundState(roundId: string): Promise<void> {
  const client = getCacheRedis();
  if (!client) return;
  await client.del(stateKey(roundId), betsKey(roundId));
}
