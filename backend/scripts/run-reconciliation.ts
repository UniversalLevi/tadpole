/**
 * Run reconciliation job. Use with cron for daily run: 0 2 * * * (e.g. 2 AM daily)
 * Run from backend: npm run reconciliation
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { connectMongo } from '../src/db/mongo.js';
import { runReconciliation } from '../src/reconciliation/index.js';

async function main() {
  await connectMongo();
  const result = await runReconciliation();
  console.log('Reconciliation:', result);
  process.exit(result.mismatchCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
