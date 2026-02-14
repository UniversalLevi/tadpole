import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  createWithdrawalRequest,
  getMyWithdrawals,
} from './withdrawal.service.js';

const requestSchema = z.object({
  body: z.object({
    amount: z.number().positive(),
  }),
});

const router = Router();

router.post('/request', async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const parsed = requestSchema.safeParse({ body: req.body });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { amount } = parsed.data.body;
  try {
    const requestId = await createWithdrawalRequest(userId, amount);
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
