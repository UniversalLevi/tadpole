import mongoose from 'mongoose';
import { User, WithdrawalRequest, UserBonus, WalletTransaction } from '../models/index.js';
import { config } from '../config/index.js';
import { getSystemConfig } from '../models/SystemConfig.js';

export type EligibilityReasonCode =
  | 'withdrawals_paused'
  | 'user_not_found'
  | 'account_frozen'
  | 'under_review'
  | 'min_amount'
  | 'bonus_wager'
  | 'withdrawal_cooldown'
  | 'max_per_day'
  | 'deposit_cooldown';

export interface EligibilityResult {
  allowed: boolean;
  reason?: string;
  reasonCode?: EligibilityReasonCode;
}

/**
 * Centralized withdrawal eligibility checks. Used by API and worker.
 */
export async function runWithdrawalEligibilityChecks(
  userId: string,
  amount: number,
  _requestId?: string
): Promise<EligibilityResult> {
  const sys = await getSystemConfig();
  if (sys.withdrawalsPaused) {
    return { allowed: false, reason: 'Withdrawals are temporarily paused', reasonCode: 'withdrawals_paused' };
  }

  const user = await User.findById(userId).lean();
  if (!user) return { allowed: false, reason: 'User not found', reasonCode: 'user_not_found' };
  if (user.isFrozen) return { allowed: false, reason: 'Account is frozen', reasonCode: 'account_frozen' };
  if ((user as { withdrawalsPausedByRisk?: boolean }).withdrawalsPausedByRisk) {
    return { allowed: false, reason: 'Account under review', reasonCode: 'under_review' };
  }
  const riskScore = (user as { riskScore?: number }).riskScore ?? 0;
  if (riskScore >= config.riskScoreThresholdBlock) {
    return { allowed: false, reason: 'Account under review', reasonCode: 'under_review' };
  }

  if (amount < config.minWithdrawalAmount) {
    return {
      allowed: false,
      reason: `Minimum withdrawal is ${config.minWithdrawalAmount} INR`,
      reasonCode: 'min_amount',
    };
  }

  const activeBonusWithUnmetWager = await UserBonus.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    status: 'active',
    $expr: { $lt: ['$wagerCompleted', '$wagerRequired'] },
  }).lean();
  if (activeBonusWithUnmetWager) {
    return { allowed: false, reason: 'Complete bonus wagering before withdrawal.', reasonCode: 'bonus_wager' };
  }

  const now = Date.now();
  const cooldownCutoff = new Date(now - config.withdrawalCooldownMs);
  const dayCutoff = new Date(now - 24 * 60 * 60 * 1000);

  const lastCompleted = await WithdrawalRequest.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    status: 'completed',
  })
    .sort({ processedAt: -1 })
    .select('processedAt')
    .lean();
  const lastProcessed = lastCompleted?.processedAt;
  if (lastProcessed && new Date(lastProcessed).getTime() > cooldownCutoff.getTime()) {
    return { allowed: false, reason: 'Withdrawal cooldown active. Try again later.', reasonCode: 'withdrawal_cooldown' };
  }

  const completedToday = await WithdrawalRequest.countDocuments({
    userId: new mongoose.Types.ObjectId(userId),
    status: 'completed',
    processedAt: { $gte: dayCutoff },
  });
  if (completedToday >= config.maxWithdrawalsPerDay) {
    return {
      allowed: false,
      reason: `Maximum ${config.maxWithdrawalsPerDay} withdrawals per day reached.`,
      reasonCode: 'max_per_day',
    };
  }

  const depositCooldownCutoff = new Date(now - config.depositWithdrawCooldownMs);
  const lastDeposit = await WalletTransaction.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    type: 'deposit',
    status: 'completed',
    createdAt: { $gte: depositCooldownCutoff },
  })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();
  if (lastDeposit?.createdAt) {
    return {
      allowed: false,
      reason: 'Please wait after your recent deposit before withdrawing.',
      reasonCode: 'deposit_cooldown',
    };
  }

  return { allowed: true };
}
