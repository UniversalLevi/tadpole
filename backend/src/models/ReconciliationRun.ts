import mongoose from 'mongoose';

export interface ReconciliationMismatch {
  type: string;
  referenceId?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

const reconciliationRunSchema = new mongoose.Schema(
  {
    runAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['ok', 'mismatches'], default: 'ok' },
    mismatches: [{ type: mongoose.Schema.Types.Mixed }],
    summary: {
      withdrawalsChecked: Number,
      depositsChecked: Number,
      mismatchCount: Number,
    },
  },
  { timestamps: true }
);

reconciliationRunSchema.index({ runAt: -1 });

export const ReconciliationRun = mongoose.model('ReconciliationRun', reconciliationRunSchema);
