import mongoose from 'mongoose';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { User, Bet, WalletTransaction, Bonus, FraudFlag, WithdrawalRequest, ReconciliationRun } from '../models/index.js';
import { AuditLog } from '../models/AuditLog.js';
import { config } from '../config/index.js';
import { getWallet, getTransactions, updateBalance } from '../wallet/wallet.service.js';
import { getBetsByUserId } from '../bet/bet.service.js';
import {
  listAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
} from '../withdrawal/withdrawal.service.js';
import { getMongoSession, runTransaction } from '../db/mongo.js';
import { logWithContext } from '../logs/index.js';
import { auditLog } from '../lib/audit.js';
import { getSystemConfig, updateSystemConfig } from '../models/SystemConfig.js';
import { getGrowthConfig, updateGrowthConfig } from '../models/GrowthConfig.js';
import { UserBonus, Referral, DailyStats } from '../models/index.js';

const adjustmentSchema = z.object({
  body: z.object({
    userId: z.string(),
    amount: z.number(), // positive = credit, negative = debit
    reason: z.string().optional(),
  }),
});

const router = Router();

router.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await User.find({}, { passwordHash: 0 }).sort({ createdAt: -1 }).lean();
    return res.json(users);
  } catch {
    return res.status(500).json({ error: 'Failed to list users' });
  }
});

router.get('/users/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    const user = await User.findById(userId, { passwordHash: 0 }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user);
  } catch {
    return res.status(500).json({ error: 'Failed to get user' });
  }
});

router.get('/users/:userId/wallet', async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    const wallet = await getWallet(userId);
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    return res.json({
      userId: wallet.userId,
      availableBalance: wallet.availableBalance,
      lockedBalance: wallet.lockedBalance,
      currency: wallet.currency,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to get wallet' });
  }
});

router.get('/users/:userId/transactions', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
  try {
    const result = await getTransactions(userId, page, limit);
    return res.json(result);
  } catch {
    return res.status(500).json({ error: 'Failed to get transactions' });
  }
});

router.get('/users/:userId/bets', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
  try {
    const result = await getBetsByUserId(userId, page, limit);
    return res.json(result);
  } catch {
    return res.status(500).json({ error: 'Failed to get bet history' });
  }
});

router.patch('/users/:userId/freeze', async (req: Request, res: Response) => {
  const adminId = req.userId!;
  const { userId } = req.params;
  const body = req.body as { freeze?: boolean };
  const freeze = body.freeze !== false;
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { isFrozen: freeze } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    logWithContext('info', freeze ? 'User frozen' : 'User unfrozen', {
      adminId,
      userId,
      requestId: req.requestId,
    });
    auditLog('admin_freeze', {
      userId,
      metadata: { adminId, freeze },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    return res.json({ userId, isFrozen: user.isFrozen });
  } catch {
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

router.post('/wallet/adjustment', async (req: Request, res: Response) => {
  const adminId = req.userId!;
  const parsed = adjustmentSchema.safeParse({ body: req.body });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { userId, amount, reason } = parsed.data.body;
  const session = await getMongoSession();
  try {
    await runTransaction(session, async () => {
      await updateBalance(userId, {
        type: 'admin_adjustment',
        amount,
        referenceId: reason || `admin ${adminId}`,
        session,
      });
    });
    logWithContext('info', 'Admin wallet adjustment', {
      adminId,
      userId,
      amount,
      reason,
      requestId: req.requestId,
    });
    auditLog('admin_adjustment', {
      userId,
      metadata: { adminId, amount, reason },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    return res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Adjustment failed';
    return res.status(400).json({ error: msg });
  } finally {
    await session.endSession();
  }
});

router.get('/withdrawals', async (_req: Request, res: Response) => {
  try {
    const list = await listAllWithdrawals();
    return res.json(list);
  } catch {
    return res.status(500).json({ error: 'Failed to list withdrawals' });
  }
});

router.post('/withdrawals/:id/approve', async (req: Request, res: Response) => {
  const adminId = req.userId!;
  const { id } = req.params;
  try {
    await approveWithdrawal(id, adminId);
    return res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Approve failed';
    return res.status(400).json({ error: msg });
  }
});

router.post('/withdrawals/:id/reject', async (req: Request, res: Response) => {
  const adminId = req.userId!;
  const { id } = req.params;
  try {
    await rejectWithdrawal(id, adminId);
    return res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Reject failed';
    return res.status(400).json({ error: msg });
  }
});

router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const config = await getSystemConfig();
    return res.json(config);
  } catch {
    return res.status(500).json({ error: 'Failed to get settings' });
  }
});

router.patch('/settings', async (req: Request, res: Response) => {
  const body = req.body as { bettingPaused?: boolean; withdrawalsPaused?: boolean; newRoundsPaused?: boolean };
  try {
    const sysConfig = await updateSystemConfig({
      ...(typeof body.bettingPaused === 'boolean' && { bettingPaused: body.bettingPaused }),
      ...(typeof body.withdrawalsPaused === 'boolean' && { withdrawalsPaused: body.withdrawalsPaused }),
      ...(typeof body.newRoundsPaused === 'boolean' && { newRoundsPaused: body.newRoundsPaused }),
    });
    return res.json(sysConfig);
  } catch {
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/bonuses', async (_req: Request, res: Response) => {
  try {
    const list = await Bonus.find().sort({ createdAt: -1 }).lean();
    return res.json(list);
  } catch {
    return res.status(500).json({ error: 'Failed to list bonuses' });
  }
});

const bonusCreateSchema = z.object({
  body: z.object({
    type: z.enum(['deposit_match', 'cashback', 'promo']),
    name: z.string().min(1),
    percentage: z.number().optional(),
    maxAmount: z.number().optional(),
    wagerMultiplier: z.number().optional(),
    expiryDate: z.union([z.string(), z.date()]).optional(),
    code: z.string().optional(),
    maxRedemptions: z.number().optional(),
  }),
});

router.post('/bonuses', async (req: Request, res: Response) => {
  const parsed = bonusCreateSchema.safeParse({ body: req.body });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const b = parsed.data.body;
  try {
    const doc = await Bonus.create({
      type: b.type,
      name: b.name,
      percentage: b.percentage ?? 0,
      maxAmount: b.maxAmount ?? 0,
      wagerMultiplier: b.wagerMultiplier ?? 0,
      expiryDate: b.expiryDate ? new Date(b.expiryDate) : undefined,
      isActive: true,
      code: b.code?.trim().toUpperCase() || undefined,
      maxRedemptions: b.maxRedemptions,
    });
    return res.status(201).json(doc);
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : 'Create failed' });
  }
});

router.patch('/bonuses/:id', async (req: Request, res: Response) => {
  const body = req.body as { isActive?: boolean; expiryDate?: string; maxRedemptions?: number };
  try {
    const update: Record<string, unknown> = {};
    if (typeof body.isActive === 'boolean') update.isActive = body.isActive;
    if (body.expiryDate !== undefined) update.expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
    if (typeof body.maxRedemptions === 'number') update.maxRedemptions = body.maxRedemptions;
    const doc = await Bonus.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).lean();
    if (!doc) return res.status(404).json({ error: 'Bonus not found' });
    return res.json(doc);
  } catch {
    return res.status(500).json({ error: 'Failed to update bonus' });
  }
});

router.get('/growth-config', async (_req: Request, res: Response) => {
  try {
    const cfg = await getGrowthConfig();
    return res.json(cfg);
  } catch {
    return res.status(500).json({ error: 'Failed to get growth config' });
  }
});

const growthConfigPatchSchema = z.object({
  body: z.object({
    firstDepositBonusPercent: z.number().optional(),
    firstDepositBonusMaxAmount: z.number().optional(),
    firstDepositWagerMultiplier: z.number().optional(),
    cashbackPercent: z.number().optional(),
    cashbackPeriodDays: z.number().optional(),
    referralRewardType: z.enum(['flat', 'percent_loss']).optional(),
    referralFlatAmount: z.number().optional(),
    referralPercentOfLoss: z.number().optional(),
    vipSilverThreshold: z.number().optional(),
    vipGoldThreshold: z.number().optional(),
    vipPlatinumThreshold: z.number().optional(),
    vipSilverCashbackPercent: z.number().optional(),
    vipGoldCashbackPercent: z.number().optional(),
    vipPlatinumCashbackPercent: z.number().optional(),
  }),
});

router.patch('/growth-config', async (req: Request, res: Response) => {
  const parsed = growthConfigPatchSchema.safeParse({ body: req.body });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  try {
    const cfg = await updateGrowthConfig(parsed.data.body);
    return res.json(cfg);
  } catch {
    return res.status(500).json({ error: 'Failed to update growth config' });
  }
});

router.get('/growth', async (_req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [bonusUsage, referralStats, dailyStatsToday, dailyStatsLast7] = await Promise.all([
      UserBonus.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Referral.aggregate<{ totalReferrals: number; totalCommission: number }>([
        { $group: { _id: null, totalReferrals: { $sum: 1 }, totalCommission: { $sum: '$commissionEarned' } } },
      ]).then((r) => r[0] ?? { totalReferrals: 0, totalCommission: 0 }),
      DailyStats.findOne({ date: today }).lean(),
      DailyStats.find({}).sort({ date: -1 }).limit(7).lean(),
    ]);
    const bonusByStatus = bonusUsage.reduce((acc, x) => ({ ...acc, [x._id]: x.count }), {} as Record<string, number>);
    return res.json({
      bonusUsage: bonusByStatus,
      referralStats: {
        totalReferrals: referralStats.totalReferrals,
        totalCommissionPaid: referralStats.totalCommission,
      },
      revenueToday: dailyStatsToday
        ? { totalBetVolume: dailyStatsToday.totalBetVolume, totalPayout: dailyStatsToday.totalPayout, netRevenue: dailyStatsToday.netRevenue }
        : null,
      revenueLast7Days: dailyStatsLast7,
    });
  } catch (e) {
    logWithContext('error', 'Admin growth failed', { error: e instanceof Error ? e.message : String(e) });
    return res.status(500).json({ error: 'Failed to get growth stats' });
  }
});

const fifteenMinutesAgo = () => new Date(Date.now() - 15 * 60 * 1000);
const oneMinuteAgo = () => new Date(Date.now() - 60 * 1000);
const oneDayAgo = () => new Date(Date.now() - 24 * 60 * 60 * 1000);
const sevenDaysAgo = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const [activeUsers, betsLastMinute, depositVolume24h] = await Promise.all([
      AuditLog.distinct('userId', { action: 'login', createdAt: { $gte: fifteenMinutesAgo() } }),
      Bet.countDocuments({ createdAt: { $gte: oneMinuteAgo() } }),
      WalletTransaction.aggregate<{ total: number }>([
        { $match: { type: 'deposit', status: 'completed', createdAt: { $gte: oneDayAgo() } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).then((r) => r[0]?.total ?? 0),
    ]);
    return res.json({
      activeUsers: activeUsers.length,
      betsPerMinute: betsLastMinute,
      roundBettingWindowMs: config.bettingWindowMs,
      roundGapAfterSettleMs: config.roundGapAfterSettleMs,
      paymentVolume24h: depositVolume24h,
    });
  } catch (e) {
    logWithContext('error', 'Admin metrics failed', { error: e instanceof Error ? e.message : String(e) });
    return res.status(500).json({ error: 'Failed to get metrics' });
  }
});

const sevenDaysAgoForRisk = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

router.get('/risk/overview', async (_req: Request, res: Response) => {
  try {
    const threshold = config.riskScoreThresholdBlock;
    const last7d = sevenDaysAgoForRisk();
    const [
      highRiskUsers,
      pendingCount,
      processingCount,
      recentFraudFlags,
      failedWithdrawals,
      depositVolume24h,
      lastReconciliation,
    ] = await Promise.all([
      User.find({ riskScore: { $gte: threshold } })
        .select('_id email riskScore riskScoreUpdatedAt withdrawalsPausedByRisk')
        .sort({ riskScore: -1 })
        .limit(50)
        .lean(),
      WithdrawalRequest.countDocuments({ status: 'pending' }),
      WithdrawalRequest.countDocuments({ status: 'processing' }),
      FraudFlag.find()
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('userId', 'email')
        .lean(),
      WithdrawalRequest.find({ status: 'failed' })
        .sort({ processedAt: -1 })
        .limit(50)
        .populate('userId', 'email')
        .lean(),
      WalletTransaction.aggregate<{ total: number }>([
        { $match: { type: 'deposit', status: 'completed', createdAt: { $gte: oneDayAgo() } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).then((r) => r[0]?.total ?? 0),
      ReconciliationRun.findOne().sort({ runAt: -1 }).select('runAt status summary').lean(),
    ]);

    const depositTrends = await WalletTransaction.aggregate<{ _id: string; total: number }>([
      { $match: { type: 'deposit', status: 'completed', createdAt: { $gte: sevenDaysAgo() } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]);

    return res.json({
      highRiskUsers: highRiskUsers.map((u) => ({
        userId: (u._id as mongoose.Types.ObjectId).toString(),
        email: u.email,
        riskScore: (u as { riskScore?: number }).riskScore ?? 0,
        riskScoreUpdatedAt: (u as { riskScoreUpdatedAt?: Date }).riskScoreUpdatedAt,
        withdrawalsPausedByRisk: (u as { withdrawalsPausedByRisk?: boolean }).withdrawalsPausedByRisk,
      })),
      withdrawalQueue: { pending: pendingCount, processing: processingCount },
      fraudAlerts: recentFraudFlags.map((f) => ({
        _id: (f._id as mongoose.Types.ObjectId).toString(),
        userId: (f.userId as { _id?: mongoose.Types.ObjectId; email?: string })?._id?.toString(),
        email: (f.userId as { email?: string })?.email,
        flagType: f.flagType,
        severity: f.severity,
        metadata: f.metadata,
        createdAt: f.createdAt,
      })),
      failedPayouts: failedWithdrawals.map((w) => ({
        _id: (w._id as mongoose.Types.ObjectId).toString(),
        userId: (w.userId as { _id?: mongoose.Types.ObjectId; email?: string })?._id?.toString(),
        email: (w.userId as { email?: string })?.email,
        amount: w.amount,
        failureReason: (w as { failureReason?: string }).failureReason,
        attemptCount: (w as { attemptCount?: number }).attemptCount,
        processedAt: (w as { processedAt?: Date }).processedAt,
      })),
      depositTrends: {
        volume24h: depositVolume24h,
        last7Days: depositTrends.reduce((acc, d) => ({ ...acc, [d._id]: d.total }), {} as Record<string, number>),
      },
      lastReconciliation: lastReconciliation
        ? {
            runAt: (lastReconciliation as { runAt?: Date }).runAt,
            status: (lastReconciliation as { status?: string }).status,
            summary: (lastReconciliation as { summary?: unknown }).summary,
          }
        : null,
    });
  } catch (e) {
    logWithContext('error', 'Admin risk overview failed', { error: e instanceof Error ? e.message : String(e) });
    return res.status(500).json({ error: 'Failed to get risk overview' });
  }
});

router.get('/analytics', async (_req: Request, res: Response) => {
  try {
    const last24h = oneDayAgo();
    const last7d = sevenDaysAgo();

    const [
      totalUsers,
      usersWithDeposit,
      dailyActiveUserIds,
      betsLast24h,
      betsLast7dByDay,
      avgBetSize24h,
      avgBetSize7d,
    ] = await Promise.all([
      User.countDocuments(),
      WalletTransaction.distinct('userId', { type: 'deposit', status: 'completed' }),
      Promise.all([
        AuditLog.distinct('userId', { action: 'login', createdAt: { $gte: last24h } }),
        Bet.distinct('userId', { createdAt: { $gte: last24h } }),
        WalletTransaction.distinct('userId', { type: 'deposit', createdAt: { $gte: last24h } }),
      ]).then(([a, b, c]) => [...new Set([...a, ...b, ...c])]),
      Bet.countDocuments({ createdAt: { $gte: last24h } }),
      Bet.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: last7d } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Bet.aggregate<{ avg: number }>([
        { $match: { createdAt: { $gte: last24h } } },
        { $group: { _id: null, avg: { $avg: '$amount' } } },
      ]).then((r) => r[0]?.avg ?? 0),
      Bet.aggregate<{ avg: number }>([
        { $match: { createdAt: { $gte: last7d } } },
        { $group: { _id: null, avg: { $avg: '$amount' } } },
      ]).then((r) => r[0]?.avg ?? 0),
    ]);

    const conversionCount = usersWithDeposit.length;
    const conversionRate = totalUsers > 0 ? conversionCount / totalUsers : 0;
    const betFrequencyByDay = betsLast7dByDay.reduce((acc, x) => ({ ...acc, [x._id]: x.count }), {} as Record<string, number>);

    const oneDayMs = 24 * 60 * 60 * 1000;
    const usersCreatedLast7d = await User.find({ createdAt: { $gte: last7d } }).select('_id createdAt').lean();
    let retentionDay1 = 0;
    let retentionDay7 = 0;
    for (const u of usersCreatedLast7d) {
      const firstDayEnd = new Date(u.createdAt.getTime() + oneDayMs);
      const day7End = new Date(u.createdAt.getTime() + 7 * oneDayMs);
      const [hasActivityDay1, hasActivityDay7] = await Promise.all([
        Promise.all([
          Bet.exists({ userId: u._id, createdAt: { $gte: firstDayEnd, $lt: new Date(firstDayEnd.getTime() + oneDayMs) } }),
          AuditLog.exists({ userId: u._id, action: 'login', createdAt: { $gte: firstDayEnd, $lt: new Date(firstDayEnd.getTime() + oneDayMs) } }),
        ]).then(([b, a]) => b || a),
        Promise.all([
          Bet.exists({ userId: u._id, createdAt: { $gte: day7End, $lt: new Date(day7End.getTime() + oneDayMs) } }),
          AuditLog.exists({ userId: u._id, action: 'login', createdAt: { $gte: day7End, $lt: new Date(day7End.getTime() + oneDayMs) } }),
        ]).then(([b, a]) => b || a),
      ]);
      if (hasActivityDay1) retentionDay1++;
      if (hasActivityDay7) retentionDay7++;
    }

    return res.json({
      dailyActiveUsers: dailyActiveUserIds.length,
      conversionRate: Math.round(conversionRate * 100) / 100,
      conversionCount,
      totalUsers,
      betFrequencyByDay,
      averageBetSize24h: Math.round(avgBetSize24h * 100) / 100,
      averageBetSize7d: Math.round(avgBetSize7d * 100) / 100,
      retentionDay1: usersCreatedLast7d.length > 0 ? Math.round((retentionDay1 / usersCreatedLast7d.length) * 100) / 100 : 0,
      retentionDay7: usersCreatedLast7d.length > 0 ? Math.round((retentionDay7 / usersCreatedLast7d.length) * 100) / 100 : 0,
      betsLast24h: betsLast24h,
    });
  } catch (e) {
    logWithContext('error', 'Admin analytics failed', { error: e instanceof Error ? e.message : String(e) });
    return res.status(500).json({ error: 'Failed to get analytics' });
  }
});

export default router;
