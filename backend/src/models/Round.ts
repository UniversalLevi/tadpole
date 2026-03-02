import mongoose from 'mongoose';

export type RoundStatus = 'betting' | 'closed' | 'settled';

const roundSchema = new mongoose.Schema(
  {
    roundNumber: { type: Number, required: true, unique: true },
    status: { type: String, enum: ['betting', 'closed', 'settled'], required: true },
    result: { type: Number }, // 0-9, set on settlement
    totalBetAmount: { type: Number, default: 0 },
    startedAt: { type: Date, required: true },
    bettingClosesAt: { type: Date, required: true },
    settledAt: { type: Date },
    serverSeed: { type: String, required: true },
    serverSeedHash: { type: String, required: true },
  },
  { timestamps: true }
);

roundSchema.index({ status: 1 });
// roundNumber unique index is created by schema option above; do not add duplicate

export const Round = mongoose.model('Round', roundSchema);
