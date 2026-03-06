/**
 * Aviator simulation script (no external load-test tools).
 *
 * Goal: simulate multiple users placing bets and cashing out to verify:
 * - no duplicate cashouts
 * - cashout rejected after crash
 * - wallet ledger remains consistent
 *
 * Run from backend folder:
 *   tsx scripts/aviator-sim.ts
 *
 * Requires MONGODB_URI in backend/.env
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { connectMongo } from '../src/db/mongo.js';
import { User, Wallet } from '../src/models/index.js';
import { createWalletIfMissing, updateBalance } from '../src/wallet/wallet.service.js';
import { placeAviatorBet, cashoutAviatorBet, getAviatorPublicState } from '../src/games/aviator/aviator.service.js';

const BCRYPT_ROUNDS = 8;

function randEmail(): string {
  const id = crypto.randomBytes(6).toString('hex');
  return `bot_${id}@tadpole.local`;
}

async function ensureBotUsers(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const email = randEmail();
    const passwordHash = await bcrypt.hash('botpassword', BCRYPT_ROUNDS);
    const user = await User.create({ email, passwordHash, role: 'user', isVerified: false, isFrozen: false, referralCode: `BOT${i}${Date.now()}` });
    await createWalletIfMissing(user._id);
    await Wallet.updateOne({ userId: user._id }, { $set: { availableBalance: 0, lockedBalance: 0 } });
    await updateBalance(user._id.toString(), { type: 'deposit', amount: 100000, referenceId: 'bot_seed' });
    ids.push(user._id.toString());
  }
  return ids;
}

async function waitForBetting(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    const s = await getAviatorPublicState();
    if (s.phase === 'betting' && s.roundId) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Timed out waiting for betting phase');
}

async function main() {
  const bots = Number(process.env.BOTS ?? 200);
  const cashoutCount = Number(process.env.CASHOUTS ?? 50);
  console.log(`Starting aviator sim with ${bots} bots, up to ${cashoutCount} cashouts`);
  await connectMongo();

  const userIds = await ensureBotUsers(bots);
  await waitForBetting();
  const s = await getAviatorPublicState();
  if (!s.roundId) throw new Error('No active round');
  console.log(`Betting round: #${s.roundNumber} (${s.roundId})`);

  // Place up to 200 bets in parallel (all bots place one bet this round)
  const toPlace = userIds.slice(0, 200);
  const placed = await Promise.all(
    toPlace.map((uid) =>
      placeAviatorBet(uid, 100, Math.random() > 0.7 ? 2 + Math.random() * 2 : undefined).catch((e: unknown) => ({ betId: '', error: e }))
    )
  );
  const betIdToUserId: Array<{ betId: string; userId: string }> = [];
  placed.forEach((x, i) => {
    if (x && typeof x === 'object' && 'betId' in x && typeof (x as { betId: string }).betId === 'string' && (x as { betId: string }).betId) {
      betIdToUserId.push({ betId: (x as { betId: string }).betId, userId: toPlace[i]! });
    }
  });
  console.log(`Placed ${betIdToUserId.length} bets`);

  // Wait for running and try cashouts
  let running = false;
  for (let i = 0; i < 200; i++) {
    const st = await getAviatorPublicState();
    if (st.phase === 'running') {
      running = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!running) console.log('Did not observe running quickly; continuing');

  // Burst of cashouts: take first N and run up to 50 parallel cashouts (with small stagger)
  const cashoutTargets = betIdToUserId.slice(0, Math.min(cashoutCount, betIdToUserId.length));
  await Promise.all(
    cashoutTargets.map(async ({ betId: bid, userId: uid }) => {
      await new Promise((r) => setTimeout(r, Math.random() * 800));
      try {
        await cashoutAviatorBet(uid, bid);
      } catch {
        // ignore (could be late or already cashed out)
      }
      // Attempt duplicate cashout (should fail)
      try {
        await cashoutAviatorBet(uid, bid);
        console.error('Duplicate cashout unexpectedly succeeded', bid);
      } catch {
        // expected
      }
    })
  );
  console.log(`Attempted ${cashoutTargets.length} cashouts`);

  // Wait for crash
  for (let i = 0; i < 200; i++) {
    const st = await getAviatorPublicState();
    if (st.phase === 'crashed') {
      console.log(`Crashed at ${st.crashed?.crashPoint ?? 0}x`);
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  // Late cashout should fail
  if (betIdToUserId[0]) {
    try {
      await cashoutAviatorBet(betIdToUserId[0].userId, betIdToUserId[0].betId);
      console.error('Late cashout unexpectedly succeeded');
    } catch {
      console.log('Late cashout correctly rejected');
    }
  }

  // Sanity: ensure wallets are non-negative
  const bad = await Wallet.countDocuments({ availableBalance: { $lt: 0 } });
  console.log(bad === 0 ? 'Wallet sanity OK (no negatives)' : `Wallet sanity FAILED (negative balances: ${bad})`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

