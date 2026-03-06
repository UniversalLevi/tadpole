/**
 * Run fraud detection rules (same-IP multiple accounts). Use with cron for periodic run.
 * Run from backend: npm run fraud-scan
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { connectMongo } from '../src/db/mongo.js';
import { checkSameIpMultipleAccounts } from '../src/fraud/index.js';

async function main() {
  await connectMongo();
  await checkSameIpMultipleAccounts();
  console.log('Fraud scan (same-IP) completed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
