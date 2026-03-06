import mongoose from 'mongoose';

export type FraudFlagSeverity = 'low' | 'medium' | 'high';

const fraudFlagSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    flagType: { type: String, required: true },
    severity: { type: String, enum: ['low', 'medium', 'high'], required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

fraudFlagSchema.index({ userId: 1 });
fraudFlagSchema.index({ createdAt: -1 });
fraudFlagSchema.index({ severity: 1 });

export const FraudFlag = mongoose.model('FraudFlag', fraudFlagSchema);
