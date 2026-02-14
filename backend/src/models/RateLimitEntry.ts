import mongoose from 'mongoose';

const rateLimitEntrySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    resetTime: { type: Date, required: true },
  },
  { timestamps: false }
);

rateLimitEntrySchema.index({ key: 1 }, { unique: true });
rateLimitEntrySchema.index({ resetTime: 1 }, { expireAfterSeconds: 0 }); // TTL for cleanup

export const RateLimitEntry = mongoose.model('RateLimitEntry', rateLimitEntrySchema);
