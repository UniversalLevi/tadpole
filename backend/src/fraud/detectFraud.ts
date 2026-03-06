import mongoose from 'mongoose';
import { FraudFlag, WithdrawalRequest, WalletTransaction, Bet, AviatorBet } from '../models/index.js';
import { AuditLog } from '../models/AuditLog.js';
import { config } from '../config/index.js';
import type { FraudFlagSeverity } from '../models/index.js';
import { logWithContext } from '../logs/index.js';
import { updateUserRiskScore } from '../risk/index.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const WIN_RATIO_THRESHOLD = 0.8;
const MIN_BETS_FOR_WIN_RATIO = 20;

export async function createFraudFlag(
  userId: string,
  flagType: string,
  severity: FraudFlagSeverity,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await FraudFlag.create({
      userId: new mongoose.Types.ObjectId(userId),
      flagType,
      severity,
      metadata,
    });
    logWithContext('info', 'Fraud flag created', { userId, flagType, severity });
    updateUserRiskScore(userId).catch(() => {});
  } catch (e) {
    logWithContext('warn', 'Failed to create fraud flag', { userId, flagType, error: e instanceof Error ? e.message : e });
  }
}

/**
 * Check for multiple accounts from same IP (logins). Run periodically.
 */
export async function checkSameIpMultipleAccounts(): Promise<void> {
  const since = new Date(Date.now() - SEVEN_DAYS_MS);
  const logins = await AuditLog.find({
    action: 'login',
    createdAt: { $gte: since },
    ipAddress: { $exists: true, $ne: '' },
  })
    .select('userId ipAddress')
    .lean();

  const ipToUserIds = new Map<string, Set<string>>();
  for (const l of logins) {
    const ip = l.ipAddress as string;
    const uid = (l.userId as mongoose.Types.ObjectId)?.toString();
    if (!ip || !uid) continue;
    if (!ipToUserIds.has(ip)) ipToUserIds.set(ip, new Set());
    ipToUserIds.get(ip)!.add(uid);
  }

  for (const [ip, userIds] of ipToUserIds) {
    if (userIds.size < 2) continue;
    const severity: FraudFlagSeverity = userIds.size >= 5 ? 'high' : userIds.size >= 3 ? 'medium' : 'low';
    for (const uid of userIds) {
      await createFraudFlag(uid, 'same_ip_multiple_accounts', severity, { ip, accountCount: userIds.size });
    }
  }
}

/**
 * Check if this payout destination (UPI/bank) is already used by another user. Call on withdrawal request.
 */
export async function checkSamePayoutDestination(
  userId: string,
  upiId?: string,
  bankAccountRef?: string,
  bankIfsc?: string
): Promise<void> {
  const key = upiId
    ? `upi:${upiId.toLowerCase().trim()}`
    : bankAccountRef && bankIfsc
      ? `bank:${bankIfsc}:${bankAccountRef}`
      : null;
  if (!key) return;

  const conditions: mongoose.FilterQuery<unknown>[] = [];
  if (upiId) conditions.push({ upiId: upiId.trim(), userId: { $ne: new mongoose.Types.ObjectId(userId) } });
  if (bankAccountRef && bankIfsc) conditions.push({ bankAccountRef, bankIfsc, userId: { $ne: new mongoose.Types.ObjectId(userId) } });
  if (conditions.length === 0) return;
  const existing = await WithdrawalRequest.findOne({ $or: conditions }).select('userId').limit(1).lean();

  if (existing) {
    await createFraudFlag(userId, 'same_payout_destination', 'medium', { destinationKey: key });
    await createFraudFlag((existing.userId as mongoose.Types.ObjectId).toString(), 'same_payout_destination', 'medium', { destinationKey: key });
  }
}

/**
 * Call when deposit cooldown blocks withdrawal (last deposit within N min).
 */
export async function flagDepositInstantWithdraw(userId: string): Promise<void> {
  await createFraudFlag(userId, 'deposit_instant_withdraw', 'medium', {
    cooldownMs: config.depositWithdrawCooldownMs,
  });
}

/**
 * Check for extremely high win ratio. Run periodically or on withdrawal.
 */
export async function checkHighWinRatio(userId: string): Promise<void> {
  const uid = new mongoose.Types.ObjectId(userId);
  const [predictionBets, aviatorBets] = await Promise.all([
    Bet.find({ userId: uid }).sort({ createdAt: -1 }).limit(500).select('amount status payoutAmount').lean(),
    AviatorBet.find({ userId: uid }).sort({ createdAt: -1 }).limit(500).select('betAmount status payout').lean(),
  ]);

  const totalBets = predictionBets.length + aviatorBets.length;
  if (totalBets < MIN_BETS_FOR_WIN_RATIO) return;

  let wins = 0;
  for (const b of predictionBets) {
    if ((b.status as string) === 'won') wins++;
  }
  for (const b of aviatorBets) {
    if ((b.status as string) === 'cashed_out' && (b.payout as number) > 0) wins++;
  }

  const ratio = wins / totalBets;
  if (ratio >= WIN_RATIO_THRESHOLD) {
    await createFraudFlag(userId, 'high_win_ratio', 'high', { winRatio: ratio, totalBets, wins });
  }
}
