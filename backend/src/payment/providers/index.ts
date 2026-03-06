import type { PayoutProvider } from './types.js';
import { config } from '../../config/index.js';
import { razorpayPayoutProvider } from './razorpay.payout.js';
import { cashfreePayoutProvider } from './cashfree.payout.js';

const providers: Record<string, PayoutProvider> = {
  razorpay: razorpayPayoutProvider,
  cashfree: cashfreePayoutProvider,
};

export function getPrimaryPayoutProvider(): PayoutProvider {
  const name = config.primaryPayoutProvider;
  return providers[name] ?? razorpayPayoutProvider;
}

export function getFallbackPayoutProvider(): PayoutProvider | null {
  const name = config.fallbackPayoutProvider;
  if (!name || name === config.primaryPayoutProvider) return null;
  return providers[name] ?? null;
}

export type { PayoutProvider, CreatePayoutParams, CreatePayoutResult } from './types.js';
