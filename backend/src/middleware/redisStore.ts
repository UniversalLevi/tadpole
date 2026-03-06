import type { Options, Store, ClientRateLimitInfo, IncrementResponse } from 'express-rate-limit';
import Redis from 'ioredis';
import { config } from '../config/index.js';

export type RedisStoreOptions = {
  prefix?: string;
  windowMs: number;
};

/**
 * Redis store for express-rate-limit. Uses one Redis client per store instance.
 * When REDIS_URL is not set or empty, getRedisStore() returns undefined so callers can fall back to MongoStore.
 */
function createRedisClient(): Redis | null {
  const url = config.redisUrl;
  if (!url || url === '') return null;
  try {
    return new Redis(url, { maxRetriesPerRequest: 3 });
  } catch {
    return null;
  }
}

export class RedisStore implements Store {
  private redis: Redis;
  prefix: string;
  windowMs: number;

  constructor(options: RedisStoreOptions) {
    const client = createRedisClient();
    if (!client) throw new Error('Redis store requires REDIS_URL');
    this.redis = client;
    this.prefix = options.prefix ?? 'rl:';
    this.windowMs = options.windowMs;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private fullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const full = this.fullKey(key);
    const count = await this.redis.incr(full);
    if (count === 1) {
      await this.redis.pexpire(full, this.windowMs);
    }
    const pttl = await this.redis.pttl(full);
    const resetTime = new Date(Date.now() + (pttl > 0 ? pttl : this.windowMs));
    return { totalHits: count, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const full = this.fullKey(key);
    await this.redis.decr(full);
  }

  async resetKey(key: string): Promise<void> {
    await this.redis.del(this.fullKey(key));
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const full = this.fullKey(key);
    const [countStr, pttl] = await Promise.all([this.redis.get(full), this.redis.pttl(full)]);
    if (countStr == null || pttl <= 0) return undefined;
    const totalHits = parseInt(countStr, 10);
    if (Number.isNaN(totalHits)) return undefined;
    const resetTime = new Date(Date.now() + pttl);
    return { totalHits, resetTime };
  }
}

/** Returns a store factory for the given options, or null if Redis is not configured. */
export function createRedisStoreIfAvailable(options: RedisStoreOptions): RedisStore | null {
  const url = config.redisUrl;
  if (!url || url === '') return null;
  try {
    return new RedisStore(options);
  } catch {
    return null;
  }
}
