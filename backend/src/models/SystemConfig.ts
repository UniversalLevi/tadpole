import mongoose from 'mongoose';

const SYSTEM_CONFIG_ID = 'system';

const systemConfigSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SYSTEM_CONFIG_ID },
    bettingPaused: { type: Boolean, default: false },
    withdrawalsPaused: { type: Boolean, default: false },
    newRoundsPaused: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);

export async function getSystemConfig(): Promise<{
  bettingPaused: boolean;
  withdrawalsPaused: boolean;
  newRoundsPaused: boolean;
}> {
  let doc = await SystemConfig.findById(SYSTEM_CONFIG_ID).lean();
  if (!doc) {
    await SystemConfig.create({
      _id: SYSTEM_CONFIG_ID,
      bettingPaused: false,
      withdrawalsPaused: false,
      newRoundsPaused: false,
    });
    doc = await SystemConfig.findById(SYSTEM_CONFIG_ID).lean();
  }
  return {
    bettingPaused: doc?.bettingPaused ?? false,
    withdrawalsPaused: doc?.withdrawalsPaused ?? false,
    newRoundsPaused: doc?.newRoundsPaused ?? false,
  };
}

export async function updateSystemConfig(updates: {
  bettingPaused?: boolean;
  withdrawalsPaused?: boolean;
  newRoundsPaused?: boolean;
}): Promise<{ bettingPaused: boolean; withdrawalsPaused: boolean; newRoundsPaused: boolean }> {
  const doc = await SystemConfig.findByIdAndUpdate(
    SYSTEM_CONFIG_ID,
    { $set: updates },
    { new: true, upsert: true }
  ).lean();
  return {
    bettingPaused: doc?.bettingPaused ?? false,
    withdrawalsPaused: doc?.withdrawalsPaused ?? false,
    newRoundsPaused: doc?.newRoundsPaused ?? false,
  };
}
