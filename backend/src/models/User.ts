import mongoose from 'mongoose';

export type UserRole = 'user' | 'admin';
export type VIPLevel = 'bronze' | 'silver' | 'gold' | 'platinum';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isVerified: { type: Boolean, default: false },
    isFrozen: { type: Boolean, default: false },
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    totalWagered: { type: Number, default: 0 },
    vipLevel: { type: String, enum: ['bronze', 'silver', 'gold', 'platinum'], default: 'bronze' },
    lastCashbackAt: { type: Date },
    riskScore: { type: Number, default: 0 },
    riskScoreUpdatedAt: { type: Date },
    withdrawalsPausedByRisk: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.index({ referralCode: 1 });

export const User = mongoose.model('User', userSchema);
