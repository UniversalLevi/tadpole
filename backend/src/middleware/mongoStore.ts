import type { Options, Store, ClientRateLimitInfo, IncrementResponse } from 'express-rate-limit';
import { RateLimitEntry } from '../models/RateLimitEntry.js';

type MongoStoreOptions = {
  prefix?: string;
  windowMs: number;
};

/**
 * MongoDB store for express-rate-limit (Modern API).
 * Uses a single collection; keys are prefixed to separate limiters.
 */
export class MongoStore implements Store {
  prefix: string;
  windowMs!: number;

  constructor(options: MongoStoreOptions) {
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
    const now = new Date();
    const resetTime = new Date(now.getTime() + this.windowMs);

    let doc = await RateLimitEntry.findOne({ key: full });
    if (!doc || doc.resetTime < now) {
      doc = await RateLimitEntry.findOneAndUpdate(
        { key: full },
        { $set: { count: 1, resetTime } },
        { new: true, upsert: true }
      );
    } else {
      doc = await RateLimitEntry.findOneAndUpdate(
        { key: full },
        { $inc: { count: 1 } },
        { new: true }
      );
    }
    return { totalHits: doc!.count, resetTime: doc!.resetTime };
  }

  async decrement(key: string): Promise<void> {
    const full = this.fullKey(key);
    await RateLimitEntry.findOneAndUpdate(
      { key: full },
      { $inc: { count: -1 } },
      { new: true }
    );
    const doc = await RateLimitEntry.findOne({ key: full });
    if (doc && doc.count <= 0) {
      await RateLimitEntry.deleteOne({ key: full });
    }
  }

  async resetKey(key: string): Promise<void> {
    await RateLimitEntry.deleteOne({ key: this.fullKey(key) });
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const doc = await RateLimitEntry.findOne({ key: this.fullKey(key) });
    if (!doc) return undefined;
    if (doc.resetTime < new Date()) return undefined;
    return { totalHits: doc.count, resetTime: doc.resetTime };
  }
}
