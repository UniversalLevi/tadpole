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
  mongodbMaxPoolSize: parseInt(optional('MONGODB_MAX_POOL_SIZE', '50'), 10),
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
  bettingWindowMs: parseInt(optional('BETTING_WINDOW_MS', '15000'), 10), // 15 sec betting window
  closingBufferMs: parseInt(optional('CLOSING_BUFFER_MS', '2000'), 10),
  roundGapAfterSettleMs: parseInt(optional('ROUND_GAP_AFTER_SETTLE_MS', '5000'), 10), // 5 sec gap before next round
  minBetAmount: parseInt(optional('MIN_BET_AMOUNT', '10'), 10),
  maxBetAmount: parseInt(optional('MAX_BET_AMOUNT', '10000'), 10),
  payoutMultiplier: parseInt(optional('PAYOUT_MULTIPLIER', '9'), 10), // 10x for 0-9 game
  // Set MONGODB_USE_TRANSACTIONS=true when using a replica set (required for production). Default false for standalone MongoDB (local dev).
  useMongoTransactions: process.env.MONGODB_USE_TRANSACTIONS === 'true',
  slowRequestMs: parseInt(optional('SLOW_REQUEST_MS', '500'), 10),
  slowQueryMs: parseInt(optional('SLOW_QUERY_MS', '200'), 10),
  // Phase 7: withdrawals, fraud, risk
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),
  withdrawalRetryDelaysMs: [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000],
  maxWithdrawalRetries: parseInt(optional('MAX_WITHDRAWAL_RETRIES', '3'), 10),
  depositWithdrawCooldownMs: parseInt(optional('DEPOSIT_WITHDRAW_COOLDOWN_MS', String(5 * 60 * 1000)), 10),
  riskScoreThresholdBlock: parseInt(optional('RISK_SCORE_THRESHOLD_BLOCK', '50'), 10),
  primaryPayoutProvider: optional('PRIMARY_PAYOUT_PROVIDER', 'razorpay'),
  fallbackPayoutProvider: optional('FALLBACK_PAYOUT_PROVIDER', 'cashfree'),
  razorpayXAccountNumber: optional('RAZORPAY_X_ACCOUNT_NUMBER', ''),
  cashfreeClientId: optional('CASHFREE_CLIENT_ID', ''),
  cashfreeClientSecret: optional('CASHFREE_CLIENT_SECRET', ''),
  // Phase 8: Redis cache
  redisKeyPrefix: optional('REDIS_KEY_PREFIX', ''),
  cacheTtlRoundStateMs: parseInt(optional('CACHE_TTL_ROUND_STATE_MS', '15000'), 10),
  cacheTtlConfigMs: parseInt(optional('CACHE_TTL_CONFIG_MS', '60000'), 10),
  cacheTtlLeaderboardMs: parseInt(optional('CACHE_TTL_LEADERBOARD_MS', '60000'), 10),
  useBetQueue: process.env.USE_BET_QUEUE === 'true',
} as const;
