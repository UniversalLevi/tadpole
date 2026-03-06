export interface CreatePayoutParams {
  amount: number; // INR
  currency: string;
  referenceId: string;
  upiId?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  narration?: string;
}

export interface CreatePayoutResult {
  success: boolean;
  providerReference?: string;
  error?: string;
}

export interface PayoutProvider {
  name: string;
  createPayout(params: CreatePayoutParams): Promise<CreatePayoutResult>;
  listPayouts?(from: Date, to: Date): Promise<Array<{ id: string; amount: number; status: string; createdAt: Date }>>;
}
