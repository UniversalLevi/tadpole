import mongoose from 'mongoose';

const withdrawalRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

withdrawalRequestSchema.index({ userId: 1 });
withdrawalRequestSchema.index({ status: 1 });

export const WithdrawalRequest = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
