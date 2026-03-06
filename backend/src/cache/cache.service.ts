import { getCacheRedis } from './redisClient.js';
import { config } from '../config/index.js';

const PREFIX = config.redisKeyPrefix ? `${config.redisKeyPrefix}:` : '';

function fullKey(key: string): string {
  return `${PREFIX}${key}`;
}

/**
 * Get a JSON value from Redis cache. Returns null on miss or when Redis is unavailable.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getCacheRedis();
  if (!client) return null;
  try {
    const raw = await client.get(fullKey(key));
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Set a value in Redis cache with TTL in milliseconds.
 */
export async function cacheSet(key: string, value: unknown, ttlMs: number): Promise<boolean> {
  const client = getCacheRedis();
  if (!client) return false;
  try {
    const k = fullKey(key);
    await client.set(k, JSON.stringify(value), 'PX', ttlMs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a cache key.
 */
export async function cacheDel(key: string): Promise<boolean> {
  const client = getCacheRedis();
  if (!client) return false;
  try {
    await client.del(fullKey(key));
    return true;
  } catch {
    return false;
  }
}

export const CACHE_KEYS = {
  roundPrediction: 'game:prediction:current',
  roundAviator: 'game:aviator:current',
  systemConfig: 'config:system',
  leaderboard: (period: string, metric: string) => `leaderboard:${period}:${metric}`,
} as const;
