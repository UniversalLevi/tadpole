import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../config/index.js';
import { withdrawRateLimiter } from '../middleware/rateLimit.js';
import {
  createWithdrawalRequest,
  getMyWithdrawals,
} from './withdrawal.service.js';

const requestSchema = z.object({
  body: z.object({
    amount: z.number().positive(),
    method: z.enum(['bank', 'upi']).default('upi'),
    upiId: z.string().optional(),
    bankAccountRef: z.string().optional(),
    bankIfsc: z.string().optional(),
  }),
});

const router = Router();

router.get('/limits', (_req: Request, res: Response) => {
  return res.json({
    minWithdrawalAmount: config.minWithdrawalAmount,
    withdrawalCooldownMs: config.withdrawalCooldownMs,
    maxWithdrawalsPerDay: config.maxWithdrawalsPerDay,
  });
});

router.post('/request', withdrawRateLimiter, async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const parsed = requestSchema.safeParse({ body: req.body });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { amount, method, upiId, bankAccountRef, bankIfsc } = parsed.data.body;
  if (method === 'upi' && !upiId) {
    return res.status(400).json({ error: 'upiId required for UPI withdrawal' });
  }
  if (method === 'bank' && (!bankAccountRef || !bankIfsc)) {
    return res.status(400).json({ error: 'bankAccountRef and bankIfsc required for bank withdrawal' });
  }
  try {
    const requestId = await createWithdrawalRequest({
      userId,
      amount,
      method,
      upiId,
      bankAccountRef,
      bankIfsc,
    });
    return res.status(201).json({ id: requestId, amount, status: 'pending' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Withdrawal request failed';
    if (msg === 'Insufficient balance') return res.status(400).json({ error: msg });
    if (msg === 'Account is frozen') return res.status(403).json({ error: msg });
    return res.status(400).json({ error: msg });
  }
});

router.get('/requests', async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const list = await getMyWithdrawals(userId);
    return res.json(list);
  } catch {
    return res.status(500).json({ error: 'Failed to get withdrawals' });
  }
});

export default router;
