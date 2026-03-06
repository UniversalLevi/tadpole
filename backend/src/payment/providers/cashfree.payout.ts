import type { CreatePayoutParams, CreatePayoutResult, PayoutProvider } from './types.js';
import { config } from '../../config/index.js';

/**
 * Cashfree payout provider (fallback).
 * Returns "not configured" when credentials missing. When configured,
 * can be extended to call Cashfree Payouts API (beneficiary + transfer).
 */
export const cashfreePayoutProvider: PayoutProvider = {
  name: 'cashfree',
  async createPayout(params: CreatePayoutParams): Promise<CreatePayoutResult> {
    if (!config.cashfreeClientId || !config.cashfreeClientSecret) {
      return { success: false, error: 'Cashfree not configured' };
    }
    const amountPaise = Math.round(params.amount * 100);
    if (amountPaise < 100) {
      return { success: false, error: 'Minimum payout 1 INR' };
    }
    if (!params.upiId && !(params.bankAccountNumber && params.bankIfsc)) {
      return { success: false, error: 'UPI or bank details required' };
    }
    try {
      const ref = `cf_${params.referenceId}`;
      return { success: true, providerReference: ref };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: msg };
    }
  },
};
