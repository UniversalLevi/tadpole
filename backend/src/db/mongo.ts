import mongoose from 'mongoose';
import { config } from '../config/index.js';

/** Use with read-only queries to prefer secondaries when using a replica set. */
export const readPreferenceSecondaryPreferred = 'secondaryPreferred' as const;

export async function connectMongo(): Promise<void> {
  await mongoose.connect(config.mongodbUri, {
    maxPoolSize: config.mongodbMaxPoolSize,
  });
}

export function getMongoSession() {
  return mongoose.startSession();
}

/** Run callback in a transaction when config.useMongoTransactions is true; otherwise run without transaction (for standalone MongoDB). */
export async function runTransaction<T>(
  session: mongoose.mongo.ClientSession,
  fn: () => Promise<T>
): Promise<T> {
  if (config.useMongoTransactions) {
    return session.withTransaction(fn);
  }
  return fn();
}
