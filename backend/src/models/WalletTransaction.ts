import mongoose from 'mongoose';

export type WalletTransactionType =
  | 'deposit'
  | 'withdrawal_request'
  | 'withdrawal_complete'
  | 'admin_adjustment'
  | 'withdrawal_refund';

export type WalletTransactionStatus = 'pending' | 'completed' | 'failed';

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['deposit', 'withdrawal_request', 'withdrawal_complete', 'admin_adjustment', 'withdrawal_refund'],
      required: true,
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
    referenceId: { type: String },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ userId: 1 });
walletTransactionSchema.index({ createdAt: -1 });
walletTransactionSchema.index({ type: 1 });

export const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
