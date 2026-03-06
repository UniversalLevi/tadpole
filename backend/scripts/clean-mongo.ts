/**
 * Script to remove all users and clean MongoDB collections used by Tadpole.
 * Run from backend directory: npm run clean-mongo
 * Requires .env with MONGODB_URI.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in .env');
  process.exit(1);
}

async function clean() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('No database connection');
    process.exit(1);
  }

  // Mongoose default collection names (lowercase plural): bets, wallettransactions, etc.
  const toClean = [
    'bets',
    'wallettransactions',
    'payments',
    'withdrawalrequests',
    'refreshtokens',
    'auditlogs',
    'idempotencykeys',
    'ratelimitentries',
    'rounds',
    'wallets',
    'users',
    'bonuses',
    'userbonuses',
    'referrals',
    'dailystats',
    'growthconfigs',
    'fraudflags',
    'reconciliationruns',
  ];

  console.log('Cleaning Tadpole collections...');
  for (const name of toClean) {
    try {
      const col = db.collection(name);
      const deleted = await col.deleteMany({});
      console.log(`  ${name}: deleted ${deleted.deletedCount} document(s)`);
    } catch (e) {
      // Collection might not exist yet
      if ((e as NodeJS.ErrnoException).code === 26 || String((e as Error).message).includes('ns not found')) {
        console.log(`  ${name}: (collection not found, skipped)`);
      } else {
        throw e;
      }
    }
  }

  // Optionally reset system config (single doc) so emergency flags are off
  try {
    const col = db.collection('systemconfigs');
    await col.deleteMany({});
    console.log('  systemconfigs: reset');
  } catch {
    console.log('  systemconfigs: (skipped)');
  }

  console.log('Done.');
  await mongoose.disconnect();
}

clean().catch((err) => {
  console.error(err);
  process.exit(1);
});
