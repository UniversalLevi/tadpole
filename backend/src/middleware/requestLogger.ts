import type { Request, Response, NextFunction } from 'express';
import { logWithContext } from '../logs/index.js';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = req.requestId ?? 'unknown';
  const start = Date.now();

  logWithContext('info', 'request_start', {
    requestId,
    method: req.method,
    path: req.path,
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    logWithContext('info', 'request_end', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: duration,
    });
  });

  next();
}
