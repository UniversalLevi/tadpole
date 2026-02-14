import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, RefreshToken } from '../models/index.js';
import { config } from '../config/index.js';
import { logWithContext } from '../logs/index.js';
import { createWalletIfMissing } from '../wallet/wallet.service.js';

const BCRYPT_ROUNDS = 12;

export async function register(email: string, password: string) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new Error('User already exists');
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash,
    role: 'user',
    isVerified: false,
    isFrozen: false,
  });
  await createWalletIfMissing(user._id);
  return { userId: user._id.toString(), email: user.email, role: user.role };
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new Error('Invalid credentials');
  }
  if (user.isFrozen) {
    throw new Error('Account is frozen');
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }
  const accessToken = jwt.sign(
    { sub: user._id.toString(), role: user.role },
    config.jwtAccessSecret,
    { expiresIn: config.accessTokenExpiry }
  );
  const refreshToken = jwt.sign(
    { sub: user._id.toString(), type: 'refresh' },
    config.jwtRefreshSecret,
    { expiresIn: config.refreshTokenExpiry }
  );
  const decoded = jwt.decode(refreshToken) as { exp: number };
  const expiresAt = decoded ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await RefreshToken.create({
    userId: user._id,
    token: refreshToken,
    expiresAt,
  });
  return {
    accessToken,
    refreshToken,
    expiresIn: 900, // 15 min in seconds
    user: { id: user._id.toString(), email: user.email, role: user.role },
  };
}

export async function refresh(refreshToken: string) {
  const stored = await RefreshToken.findOne({ token: refreshToken });
  if (!stored || stored.expiresAt < new Date()) {
    throw new Error('Invalid or expired refresh token');
  }
  let payload: { sub?: string };
  try {
    payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as { sub?: string };
  } catch {
    await RefreshToken.deleteOne({ token: refreshToken });
    throw new Error('Invalid refresh token');
  }
  if (!payload.sub) throw new Error('Invalid token');
  const user = await User.findById(payload.sub);
  if (!user || user.isFrozen) {
    await RefreshToken.deleteOne({ token: refreshToken });
    throw new Error('User not found or frozen');
  }
  const accessToken = jwt.sign(
    { sub: user._id.toString(), role: user.role },
    config.jwtAccessSecret,
    { expiresIn: config.accessTokenExpiry }
  );
  return {
    accessToken,
    expiresIn: 900,
    user: { id: user._id.toString(), email: user.email, role: user.role },
  };
}

export async function logout(refreshToken: string) {
  await RefreshToken.deleteOne({ token: refreshToken });
}
