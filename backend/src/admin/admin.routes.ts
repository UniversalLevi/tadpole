import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { User } from '../models/index.js';
import { getWallet, getTransactions, updateBalance } from '../wallet/wallet.service.js';
import {
  listAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
} from '../withdrawal/withdrawal.service.js';
import { getMongoSession } from '../db/mongo.js';
import { logWithContext } from '../logs/index.js';

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
    await session.withTransaction(async () => {
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

export default router;
