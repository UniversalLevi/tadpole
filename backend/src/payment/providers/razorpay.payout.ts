import type { CreatePayoutParams, CreatePayoutResult, PayoutProvider } from './types.js';
import { config } from '../../config/index.js';
import { logWithContext } from '../../logs/index.js';

const RAZORPAY_X_BASE = 'https://api.razorpay.com/v1';

function getAuthHeader(): string {
  const key = config.razorpayKeyId;
  const secret = config.razorpayKeySecret;
  if (!key || !secret) return '';
  return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
}

async function createContactAndFundAccount(upiId: string): Promise<string | null> {
  const auth = getAuthHeader();
  if (!auth) return null;
  const accountNumber = config.razorpayXAccountNumber;
  if (!accountNumber) {
    logWithContext('warn', 'RazorpayX account_number not set, cannot create payout');
    return null;
  }
  try {
    const contactRes = await fetch(`${RAZORPAY_X_BASE}/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        name: 'Payout User',
        email: `payout-${Date.now()}@tadpole.local`,
        contact: '9999999999',
        type: 'customer',
      }),
    });
    if (!contactRes.ok) {
      const err = await contactRes.text();
      logWithContext('warn', 'RazorpayX create contact failed', { status: contactRes.status, err });
      return null;
    }
    const contact = (await contactRes.json()) as { id?: string };
    const contactId = contact?.id;
    if (!contactId) return null;

    const faRes = await fetch(`${RAZORPAY_X_BASE}/fund_accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        contact_id: contactId,
        account_type: 'vpa',
        vpa: {
          address: upiId,
        },
      }),
    });
    if (!faRes.ok) {
      const err = await faRes.text();
      logWithContext('warn', 'RazorpayX create fund account failed', { status: faRes.status, err });
      return null;
    }
    const fa = (await faRes.json()) as { id?: string };
    return fa?.id ?? null;
  } catch (e) {
    logWithContext('warn', 'RazorpayX contact/fund_account error', { error: e instanceof Error ? e.message : e });
    return null;
  }
}

export const razorpayPayoutProvider: PayoutProvider = {
  name: 'razorpay',
  async createPayout(params: CreatePayoutParams): Promise<CreatePayoutResult> {
    const auth = getAuthHeader();
    if (!auth) {
      return { success: false, error: 'Razorpay not configured' };
    }
    const accountNumber = config.razorpayXAccountNumber;
    if (!accountNumber) {
      return { success: false, error: 'RazorpayX account_number not configured' };
    }
    let fundAccountId: string | null = null;
    if (params.upiId) {
      fundAccountId = await createContactAndFundAccount(params.upiId);
      if (!fundAccountId) {
        return { success: false, error: 'Could not create or resolve UPI fund account' };
      }
    }
    if (!fundAccountId && !params.bankAccountNumber) {
      return { success: false, error: 'Either upiId or bank details required' };
    }
    if (params.bankAccountNumber && params.bankIfsc) {
      return { success: false, error: 'Bank payout not implemented for RazorpayX in this version' };
    }
    const amountPaise = Math.round(params.amount * 100);
    if (amountPaise < 100) {
      return { success: false, error: 'Minimum payout 1 INR' };
    }
    const idempotencyKey = `payout_${params.referenceId}`.slice(0, 40);
    try {
      const body = {
        account_number: accountNumber,
        fund_account_id: fundAccountId,
        amount: amountPaise,
        currency: params.currency || 'INR',
        mode: 'UPI',
        purpose: 'refund',
        queue_if_low_balance: true,
        reference_id: params.referenceId.slice(0, 40),
        narration: (params.narration || 'Tadpole payout').slice(0, 30),
      };
      const res = await fetch(`${RAZORPAY_X_BASE}/payouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth,
          'X-Payout-Idempotency': idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { id?: string; status?: string; error?: { description?: string } };
      if (!res.ok) {
        const errMsg = data?.error?.description ?? data?.error ?? JSON.stringify(data);
        return { success: false, error: String(errMsg) };
      }
      const ref = data?.id ? `rp_${data.id}` : undefined;
      const ok = ['queued', 'processing', 'processed'].includes(String(data?.status || ''));
      return { success: ok, providerReference: ref ?? undefined, error: ok ? undefined : String(data?.status || 'unknown') };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logWithContext('warn', 'RazorpayX payout request failed', { error: msg });
      return { success: false, error: msg };
    }
  },
};
