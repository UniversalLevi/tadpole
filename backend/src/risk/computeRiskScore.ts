import mongoose from 'mongoose';
import { User, FraudFlag, WithdrawalRequest } from '../models/index.js';
import { AuditLog } from '../models/AuditLog.js';
import { config } from '../config/index.js';
import { logWithContext } from '../logs/index.js';

const SCORE_CAP = 100;
const MULTIPLE_IPS_SCORE = 10;
const RAPID_WITHDRAWALS_SCORE = 20;
const SUSPICIOUS_BETTING_SCORE = 30;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const RAPID_WITHDRAWAL_HOURS = 24;
const RAPID_WITHDRAWAL_COUNT = 3;

export async function computeRiskScore(userId: string): Promise<number> {
  const uid = new mongoose.Types.ObjectId(userId);
  let score = 0;

  const [flags, withdrawalCount, distinctIps] = await Promise.all([
    FraudFlag.find({ userId: uid }).sort({ createdAt: -1 }).limit(50).lean(),
    WithdrawalRequest.countDocuments({
      userId: uid,
      status: 'completed',
      processedAt: { $gte: new Date(Date.now() - RAPID_WITHDRAWAL_HOURS * 60 * 60 * 1000) },
    }),
    AuditLog.distinct('ipAddress', {
      userId: uid,
      action: 'login',
      createdAt: { $gte: new Date(Date.now() - SEVEN_DAYS_MS) },
      ipAddress: { $exists: true, $ne: '' },
    }),
  ]);

  for (const f of flags) {
    const sev = f.severity as string;
    if (sev === 'high') score += 20;
    else if (sev === 'medium') score += 10;
    else score += 5;
  }

  if (distinctIps.length >= 3) {
    score += MULTIPLE_IPS_SCORE;
  }

  if (withdrawalCount >= RAPID_WITHDRAWAL_COUNT) {
    score += RAPID_WITHDRAWALS_SCORE;
  }

  const hasSuspiciousBetting = flags.some(
    (f) =>
      (f.flagType as string) === 'high_win_ratio' || (f.flagType as string) === 'deposit_instant_withdraw'
  );
  if (hasSuspiciousBetting) {
    score += SUSPICIOUS_BETTING_SCORE;
  }

  return Math.min(SCORE_CAP, score);
}

export async function updateUserRiskScore(userId: string): Promise<{ score: number; blocked: boolean }> {
  const score = await computeRiskScore(userId);
  const threshold = config.riskScoreThresholdBlock;
  const blocked = score >= threshold;

  await User.updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    {
      $set: {
        riskScore: score,
        riskScoreUpdatedAt: new Date(),
        ...(blocked && { withdrawalsPausedByRisk: true }),
      },
    }
  );

  if (blocked) {
    logWithContext('info', 'User withdrawals paused by risk score', { userId, score, threshold });
  }

  return { score, blocked };
}
