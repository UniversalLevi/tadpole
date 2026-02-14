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
} as const;
