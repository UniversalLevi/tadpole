import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createTestDeposit, handleWebhookPayload } from './payment.service.js';

const testDepositSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive(), // in INR (coerce so string "100" from JSON is accepted)
  }),
});

const router = Router();

/** Test-only: add amount to wallet without Razorpay. For development/testing. */
router.post('/test-deposit', async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const parsed = testDepositSchema.safeParse({ body: req.body });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const amountINR = parsed.data.body.amount;
  if (amountINR < 1) {
    return res.status(400).json({ error: 'Minimum amount is 1 INR' });
  }
  try {
    await createTestDeposit(userId, amountINR);
    return res.status(201).json({ credited: amountINR, message: 'Amount added for testing' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Test deposit failed';
    return res.status(400).json({ error: msg });
  }
});

export async function webhookRoute(req: Request, res: Response) {
  const rawBody = req.body as Buffer;
  const signature = (req.headers['x-razorpay-signature'] as string) || '';
  if (!Buffer.isBuffer(rawBody) || !rawBody.length) {
    return res.status(400).json({ error: 'Invalid body' });
  }
  try {
    await handleWebhookPayload(rawBody, signature, req.requestId);
    return res.json({ received: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Webhook failed';
    return res.status(400).json({ error: msg });
  }
}

export default router;
