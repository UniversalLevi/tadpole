import mongoose from 'mongoose';

export type BetStatus = 'placed' | 'won' | 'lost';

const betSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Round', required: true },
    prediction: { type: Number, required: true }, // 0-9
    amount: { type: Number, required: true },
    status: { type: String, enum: ['placed', 'won', 'lost'], default: 'placed' },
    payoutMultiplier: { type: Number, required: true },
    payoutAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

betSchema.index({ userId: 1 });
betSchema.index({ roundId: 1 });
betSchema.index({ status: 1 });
betSchema.index({ userId: 1, roundId: 1 }, { unique: true });

export const Bet = mongoose.model('Bet', betSchema);
