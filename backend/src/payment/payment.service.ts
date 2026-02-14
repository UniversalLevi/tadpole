import crypto from 'node:crypto';
// import Razorpay from 'razorpay';
import mongoose from 'mongoose';
import { Payment } from '../models/index.js';
import { config } from '../config/index.js';
import { getMongoSession } from '../db/mongo.js';
import { updateBalance } from '../wallet/wallet.service.js';
import { logWithContext } from '../logs/index.js';

// Razorpay commented out for testing – use test-deposit endpoint instead
// let razorpay: Razorpay | null = null;
// function getRazorpay(): Razorpay {
//   if (!razorpay) {
//     if (!config.razorpayKeyId || !config.razorpayKeySecret) {
//       throw new Error('Razorpay not configured');
//     }
//     razorpay = new Razorpay({
//       key_id: config.razorpayKeyId,
//       key_secret: config.razorpayKeySecret,
//     });
//   }
//   return razorpay;
// }

export function verifyWebhookSignature(body: string | Buffer, signature: string): boolean {
  const secret = config.webhookSecret;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}

// export async function createOrder(userId: string, amountPaise: number) {
//   const rp = getRazorpay();
//   const order = await rp.orders.create({
//     amount: amountPaise,
//     currency: 'INR',
//     receipt: `rcpt_${userId}_${Date.now()}`,
//   });
//   await Payment.create({
//     userId: new mongoose.Types.ObjectId(userId),
//     razorpayOrderId: order.id,
//     amount: amountPaise / 100,
//     status: 'created',
//     verified: false,
//   });
//   return {
//     orderId: order.id,
//     amount: order.amount,
//     currency: order.currency,
//     keyId: config.razorpayKeyId,
//   };
// }

function isReplicaSetRequiredError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('replica set') || msg.includes('Transaction numbers');
}

/** Test-only: credit wallet directly without Razorpay. Use when Razorpay is not configured. */
export async function createTestDeposit(userId: string, amountINR: number): Promise<void> {
  if (amountINR < 1) throw new Error('Minimum amount is 1 INR');
  const session = await getMongoSession();
  try {
    await session.withTransaction(async () => {
      await updateBalance(userId, {
        type: 'deposit',
        amount: amountINR,
        referenceId: `test_${Date.now()}`,
        session,
      });
    });
    logWithContext('info', 'Test deposit credited', { userId, amount: amountINR });
  } catch (e) {
    if (isReplicaSetRequiredError(e)) {
      await updateBalance(userId, {
        type: 'deposit',
        amount: amountINR,
        referenceId: `test_${Date.now()}`,
      });
      logWithContext('info', 'Test deposit credited (no transaction)', { userId, amount: amountINR });
    } else {
      throw e;
    }
  } finally {
    await session.endSession();
  }
}

export async function handleWebhookPayload(
  rawBody: Buffer,
  signature: string,
  requestId?: string
): Promise<void> {
  if (!verifyWebhookSignature(rawBody, signature)) {
    logWithContext('warn', 'Payment webhook invalid signature', { requestId });
    throw new Error('Invalid signature');
  }

  const body = JSON.parse(rawBody.toString()) as {
    event?: string;
    payload?: {
      payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } };
    };
  };

  if (body.event !== 'payment.captured') {
    return;
  }

  const paymentEntity = body.payload?.payment?.entity;
  if (!paymentEntity?.id || !paymentEntity?.order_id) {
    return;
  }

  const razorpayPaymentId = paymentEntity.id;
  const razorpayOrderId = paymentEntity.order_id;
  const amountPaise = paymentEntity.amount ?? 0;
  const amount = amountPaise / 100;

  const session = await getMongoSession();
  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({ razorpayOrderId }).session(session);
      if (!payment) {
        logWithContext('warn', 'Payment webhook unknown order', { requestId, razorpayOrderId });
        return;
      }
      if (payment.status === 'paid' && payment.verified) {
        logWithContext('info', 'Payment webhook idempotent skip', { requestId, razorpayOrderId });
        return;
      }

      await Payment.updateOne(
        { _id: payment._id },
        {
          $set: {
            razorpayPaymentId,
            status: 'paid',
            verified: true,
          },
        },
        { session }
      );

      await updateBalance(payment.userId.toString(), {
        type: 'deposit',
        amount,
        referenceId: razorpayPaymentId,
        session,
      });
      logWithContext('info', 'Payment credited', {
        requestId,
        userId: payment.userId.toString(),
        razorpayPaymentId,
        amount,
      });
    });
  } finally {
    await session.endSession();
  }
}
