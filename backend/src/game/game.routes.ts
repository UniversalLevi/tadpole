import { Router, Request, Response } from 'express';
import { Round } from '../models/index.js';
import { getSystemConfig } from '../models/SystemConfig.js';
import { getCurrentRound } from '../round/round.service.js';

const router = Router();

router.get('/current-round', async (_req: Request, res: Response) => {
  try {
    const [round, config] = await Promise.all([getCurrentRound(), getSystemConfig()]);
    if (!round) {
      return res.json({ round: null, bettingPaused: config.bettingPaused });
    }
    const payload: Record<string, unknown> = {
      _id: round._id,
      roundNumber: round.roundNumber,
      status: round.status,
      bettingClosesAt: round.bettingClosesAt,
      serverSeedHash: round.serverSeedHash,
      totalBetAmount: round.totalBetAmount ?? 0,
    };
    if (round.status === 'settled' && round.result !== undefined) {
      payload.result = round.result;
      payload.serverSeed = round.serverSeed;
    }
    return res.json({ round: payload, bettingPaused: config.bettingPaused });
  } catch {
    return res.status(500).json({ error: 'Failed to get current round' });
  }
});

router.get('/rounds/:roundId', async (req: Request, res: Response) => {
  const { roundId } = req.params;
  try {
    const round = await Round.findById(roundId).select('-__v').lean();
    if (!round) return res.status(404).json({ error: 'Round not found' });
    const payload = { ...round };
    if (round.status !== 'settled') {
      delete (payload as Record<string, unknown>).serverSeed;
    }
    return res.json(payload);
  } catch {
    return res.status(500).json({ error: 'Failed to get round' });
  }
});

router.get('/rounds', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
  const skip = (page - 1) * limit;
  try {
    const [items, total] = await Promise.all([
      Round.find().sort({ roundNumber: -1 }).skip(skip).limit(limit).select('-serverSeed').lean(),
      Round.countDocuments(),
    ]);
    return res.json({ items, total, page, limit });
  } catch {
    return res.status(500).json({ error: 'Failed to list rounds' });
  }
});

export default router;
