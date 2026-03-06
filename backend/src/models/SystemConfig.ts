import mongoose from 'mongoose';
import { config } from '../config/index.js';
import { cacheGet, cacheSet, cacheDel, CACHE_KEYS } from '../cache/index.js';

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

export type SystemConfigData = {
  bettingPaused: boolean;
  withdrawalsPaused: boolean;
  newRoundsPaused: boolean;
};

export async function getSystemConfig(): Promise<SystemConfigData> {
  const cached = await cacheGet<SystemConfigData>(CACHE_KEYS.systemConfig);
  if (cached) return cached;
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
  const data: SystemConfigData = {
    bettingPaused: doc?.bettingPaused ?? false,
    withdrawalsPaused: doc?.withdrawalsPaused ?? false,
    newRoundsPaused: doc?.newRoundsPaused ?? false,
  };
  await cacheSet(CACHE_KEYS.systemConfig, data, config.cacheTtlConfigMs);
  return data;
}

export async function updateSystemConfig(updates: {
  bettingPaused?: boolean;
  withdrawalsPaused?: boolean;
  newRoundsPaused?: boolean;
}): Promise<SystemConfigData> {
  const doc = await SystemConfig.findByIdAndUpdate(
    SYSTEM_CONFIG_ID,
    { $set: updates },
    { new: true, upsert: true }
  ).lean();
  const data: SystemConfigData = {
    bettingPaused: doc?.bettingPaused ?? false,
    withdrawalsPaused: doc?.withdrawalsPaused ?? false,
    newRoundsPaused: doc?.newRoundsPaused ?? false,
  };
  await cacheSet(CACHE_KEYS.systemConfig, data, config.cacheTtlConfigMs);
  return data;
}

export async function invalidateSystemConfigCache(): Promise<void> {
  await cacheDel(CACHE_KEYS.systemConfig);
}
