import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { cashoutAviatorBet, getAviatorPublicState, getRoundPlayers, listLastCrashes, placeAviatorBet } from './aviator.service.js';

const router = Router();

router.get('/state', async (_req: Request, res: Response) => {
  try {
    const data = await getAviatorPublicState();
    return res.json(data);
  } catch {
    return res.status(500).json({ error: 'Failed to get aviator state' });
  }
});

router.get('/last-crashes', async (req: Request, res: Response) => {
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
  try {
    const items = await listLastCrashes(limit);
    return res.json({ items });
  } catch {
    return res.status(500).json({ error: 'Failed to list crashes' });
  }
});

router.get('/players', async (_req: Request, res: Response) => {
  try {
    const data = await getRoundPlayers();
    return res.json(data);
  } catch {
    return res.status(500).json({ error: 'Failed to get round players' });
  }
});

const betSchema = z.object({
  body: z.object({
    betAmount: z.coerce.number().positive(),
    autoCashout: z.coerce.number().optional(),
  }),
});

router.post('/bet', async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const parsed = betSchema.safeParse({ body: req.body });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  try {
    const result = await placeAviatorBet(userId, parsed.data.body.betAmount, parsed.data.body.autoCashout);
    return res.status(201).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bet failed';
    return res.status(400).json({ error: msg });
  }
});

const cashoutSchema = z.object({
  body: z.object({
    betId: z.string().min(1),
  }),
});

router.post('/cashout', async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const parsed = cashoutSchema.safeParse({ body: req.body });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  try {
    const result = await cashoutAviatorBet(userId, parsed.data.body.betId);
    return res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Cashout failed';
    return res.status(400).json({ error: msg });
  }
});

export default router;

