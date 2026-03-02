import mongoose from 'mongoose';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { IdempotencyKey } from '../models/index.js';
import { placeBet } from './bet.service.js';

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

const placeBetSchema = z.object({
  body: z.object({
    roundId: z.string(),
    prediction: z.coerce.number().int().min(0).max(9),
    amount: z.coerce.number().positive(),
    idempotencyKey: z.string().optional(),
  }),
});

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;
  const parsed = placeBetSchema.safeParse({ body: req.body });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0];
    const msg = Array.isArray(first) ? first[0] : 'Invalid request';
    return res.status(400).json({ error: msg });
  }
  const { roundId, prediction, amount } = parsed.data.body;

  if (idempotencyKey) {
    const existing = await IdempotencyKey.findOne({ key: idempotencyKey }).lean();
    if (existing) {
      if (existing.userId.toString() !== userId) {
        return res.status(409).json({ error: 'Idempotency key already used' });
      }
      return res.status(201).json(existing.response);
    }
  }

  try {
    const result = await placeBet(userId, roundId, prediction, amount);
    if (idempotencyKey) {
      await IdempotencyKey.create({
        key: idempotencyKey,
        userId: new mongoose.Types.ObjectId(userId),
        response: result,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      }).catch(() => {}); // Ignore duplicate key on race
    }
    return res.status(201).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bet failed';
    return res.status(400).json({ error: msg });
  }
});

export default router;
