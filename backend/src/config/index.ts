import dotenv from 'dotenv';

dotenv.config();

function required(key: string): string {
  const v = process.env[key];
  if (v == null || v === '') throw new Error(`Missing required env: ${key}`);
  return v;
}

function optional(key: string, def: string): string {
  return process.env[key] ?? def;
}

export const config = {
  port: parseInt(optional('PORT', '5000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  mongodbUri: required('MONGODB_URI'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  razorpayKeyId: optional('RAZORPAY_KEY_ID', ''),
  razorpayKeySecret: optional('RAZORPAY_KEY_SECRET', ''),
  webhookSecret: optional('WEBHOOK_SECRET', ''),
  frontendOrigin: optional('FRONTEND_ORIGIN', 'http://localhost:5173'),
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  minWithdrawalAmount: 100,
  withdrawalCooldownMs: parseInt(optional('WITHDRAWAL_COOLDOWN_MS', String(24 * 60 * 60 * 1000)), 10), // 24h default
  maxWithdrawalsPerDay: parseInt(optional('MAX_WITHDRAWALS_PER_DAY', '5'), 10),
  // Phase 2: round timing (ms)
  roundDurationMs: parseInt(optional('ROUND_DURATION_MS', '15000'), 10),
  bettingWindowMs: parseInt(optional('BETTING_WINDOW_MS', '10000'), 10),
  closingBufferMs: parseInt(optional('CLOSING_BUFFER_MS', '2000'), 10),
  minBetAmount: parseInt(optional('MIN_BET_AMOUNT', '10'), 10),
  maxBetAmount: parseInt(optional('MAX_BET_AMOUNT', '10000'), 10),
  payoutMultiplier: parseInt(optional('PAYOUT_MULTIPLIER', '9'), 10), // 10x for 0-9 game
  // Set MONGODB_USE_TRANSACTIONS=true when using a replica set (required for production). Default false for standalone MongoDB (local dev).
  useMongoTransactions: process.env.MONGODB_USE_TRANSACTIONS === 'true',
} as const;
