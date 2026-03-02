import rateLimit from 'express-rate-limit';
import { MongoStore } from './mongoStore.js';

const AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const GENERAL_WINDOW_MS = 1 * 60 * 1000; // 1 minute
const LOGIN_WINDOW_MS = 1 * 60 * 1000; // 1 minute
const REGISTER_WINDOW_MS = 1 * 60 * 1000; // 1 minute
const BET_WINDOW_MS = 1000; // 1 second
const DEPOSIT_WINDOW_MS = 1 * 60 * 1000; // 1 minute
const WITHDRAW_WINDOW_MS = 1 * 60 * 1000; // 1 minute

const authStore = new MongoStore({
  prefix: 'rl:auth:',
  windowMs: AUTH_WINDOW_MS,
});

const generalStore = new MongoStore({
  prefix: 'rl:general:',
  windowMs: GENERAL_WINDOW_MS,
});

const loginStore = new MongoStore({ prefix: 'rl:login:', windowMs: LOGIN_WINDOW_MS });
const registerStore = new MongoStore({ prefix: 'rl:register:', windowMs: REGISTER_WINDOW_MS });
const betStore = new MongoStore({ prefix: 'rl:bet:', windowMs: BET_WINDOW_MS });
const depositStore = new MongoStore({ prefix: 'rl:deposit:', windowMs: DEPOSIT_WINDOW_MS });
const withdrawStore = new MongoStore({ prefix: 'rl:withdraw:', windowMs: WITHDRAW_WINDOW_MS });

export const authRateLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: authStore,
  message: { error: 'Too many attempts, try again later' },
});

export const generalRateLimiter = rateLimit({
  windowMs: GENERAL_WINDOW_MS,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: generalStore,
  message: { error: 'Too many requests' },
});

export const loginRateLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: loginStore,
  message: { error: 'Too many login attempts, try again later' },
});

export const registerRateLimiter = rateLimit({
  windowMs: REGISTER_WINDOW_MS,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: registerStore,
  message: { error: 'Too many registration attempts, try again later' },
});

export const betRateLimiter = rateLimit({
  windowMs: BET_WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: betStore,
  message: { error: 'Too many bet requests, slow down' },
});

export const depositRateLimiter = rateLimit({
  windowMs: DEPOSIT_WINDOW_MS,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: depositStore,
  message: { error: 'Too many deposit attempts, try again later' },
});

export const withdrawRateLimiter = rateLimit({
  windowMs: WITHDRAW_WINDOW_MS,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: withdrawStore,
  message: { error: 'Too many withdrawal requests, try again later' },
});
