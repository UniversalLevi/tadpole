import mongoose from 'mongoose';

export type WithdrawalMethod = 'bank' | 'upi';
export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';

const withdrawalRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: ['bank', 'upi'], default: 'upi' },
    upiId: { type: String },
    bankAccountRef: { type: String },
    bankIfsc: { type: String },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'rejected'],
      default: 'pending',
    },
    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    providerReference: { type: String },
    failureReason: { type: String },
    attemptCount: { type: Number, default: 0 },
    nextRetryAt: { type: Date },
  },
  { timestamps: true }
);

withdrawalRequestSchema.index({ userId: 1 });
withdrawalRequestSchema.index({ status: 1 });
withdrawalRequestSchema.index({ status: 1, nextRetryAt: 1 });

export const WithdrawalRequest = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
