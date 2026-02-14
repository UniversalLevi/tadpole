import { Router, Request, Response } from 'express';
import { getWallet, getTransactions } from './wallet.service.js';
import { z } from 'zod';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const wallet = await getWallet(userId);
    return res.json({
      userId: wallet!.userId,
      availableBalance: wallet!.availableBalance,
      lockedBalance: wallet!.lockedBalance,
      currency: wallet!.currency,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to get wallet' });
  }
});

router.get('/transactions', async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { page, limit } = parsed.data;
  try {
    const result = await getTransactions(userId, page, limit);
    return res.json(result);
  } catch {
    return res.status(500).json({ error: 'Failed to get transactions' });
  }
});

export default router;
