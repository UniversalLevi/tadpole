import rateLimit from 'express-rate-limit';
import { MongoStore } from './mongoStore.js';

const AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const GENERAL_WINDOW_MS = 1 * 60 * 1000; // 1 minute

const authStore = new MongoStore({
  prefix: 'rl:auth:',
  windowMs: AUTH_WINDOW_MS,
});

const generalStore = new MongoStore({
  prefix: 'rl:general:',
  windowMs: GENERAL_WINDOW_MS,
});

export const authRateLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: 20, // 20 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  store: authStore,
  message: { error: 'Too many attempts, try again later' },
});

export const generalRateLimiter = rateLimit({
  windowMs: GENERAL_WINDOW_MS,
  max: 100, // 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  store: generalStore,
  message: { error: 'Too many requests' },
});
