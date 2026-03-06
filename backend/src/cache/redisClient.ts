import Redis from 'ioredis';
import { config } from '../config/index.js';

let redis: Redis | null = null;

/**
 * Shared Redis client for cache (not for Socket adapter or BullMQ).
 * Returns null when REDIS_URL is not set or connection fails.
 */
export function getCacheRedis(): Redis | null {
  if (redis) return redis;
  const url = config.redisUrl;
  if (!url || url === '') return null;
  try {
    redis = new Redis(url, { maxRetriesPerRequest: 3 });
    return redis;
  } catch {
    return null;
  }
}

export async function closeCacheRedis(): Promise<void> {
  if (redis) {
    const r = redis;
    redis = null;
    await r.quit();
  }
}
