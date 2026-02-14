import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export function verifyJwt(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(token, config.jwtAccessSecret) as { sub: string; role: string };
    req.userId = payload.sub;
    req.userRole = payload.role as 'user' | 'admin';
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
