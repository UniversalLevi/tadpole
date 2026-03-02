import mongoose from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';

export type AuditAction =
  | 'login'
  | 'register'
  | 'bet_placed'
  | 'deposit_credited'
  | 'withdraw_request'
  | 'withdraw_approved'
  | 'withdraw_rejected'
  | 'admin_freeze'
  | 'admin_adjustment';

export function auditLog(
  action: AuditAction,
  options: {
    userId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }
): void {
  const { userId, metadata, ipAddress, userAgent } = options;
  AuditLog.create({
    userId: userId ? new mongoose.Types.ObjectId(userId) : undefined,
    action,
    metadata: metadata ?? {},
    ipAddress,
    userAgent,
  }).catch(() => {}); // Non-blocking; ignore write errors
}
