import client from 'prom-client';
import type { Request } from 'express';
import { getWithdrawalQueue } from '../queue/withdrawal.queue.js';
import { getSettlementQueue } from '../queue/settlement.queue.js';

const register = new client.Registry();
register.setDefaultLabels({ app: 'tadpole-api' });
client.collectDefaultMetrics({ prefix: 'tadpole_', register });

const httpRequestsTotal = new client.Counter({
  name: 'tadpole_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});
const httpRequestDuration = new client.Histogram({
  name: 'tadpole_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const queueWithdrawalWaiting = new client.Gauge({
  name: 'tadpole_queue_withdrawal_waiting',
  help: 'Withdrawal queue waiting job count',
  registers: [register],
});
const queueWithdrawalActive = new client.Gauge({
  name: 'tadpole_queue_withdrawal_active',
  help: 'Withdrawal queue active job count',
  registers: [register],
});
const queueSettlementWaiting = new client.Gauge({
  name: 'tadpole_queue_settlement_waiting',
  help: 'Settlement queue waiting job count',
  registers: [register],
});
const queueSettlementActive = new client.Gauge({
  name: 'tadpole_queue_settlement_active',
  help: 'Settlement queue active job count',
  registers: [register],
});

const normalizeRoute = (path: string): string => {
  if (path.startsWith('/admin')) return '/admin';
  if (path.startsWith('/auth')) return '/auth';
  if (path.startsWith('/wallet')) return '/wallet';
  if (path.startsWith('/payment')) return '/payment';
  if (path.startsWith('/withdrawal')) return '/withdrawal';
  if (path.startsWith('/bet')) return '/bet';
  if (path.startsWith('/game')) return '/game';
  if (path.startsWith('/aviator')) return '/aviator';
  if (path.startsWith('/user')) return '/user';
  if (path.startsWith('/bonus')) return '/bonus';
  return path || '/';
};

export function getRegister(): client.Registry {
  return register;
}

export function recordRequest(req: Request, statusCode: number, durationMs: number): void {
  const route = normalizeRoute(req.path);
  const method = req.method;
  const status = statusCode >= 500 ? '5xx' : statusCode >= 400 ? '4xx' : '2xx';
  httpRequestsTotal.inc({ method, route, status }, 1);
  httpRequestDuration.observe({ method, route }, durationMs / 1000);
}

export async function updateQueueMetrics(): Promise<void> {
  const wq = getWithdrawalQueue();
  if (wq) {
    const counts = await wq.getJobCounts();
    queueWithdrawalWaiting.set(counts.waiting);
    queueWithdrawalActive.set(counts.active);
  } else {
    queueWithdrawalWaiting.set(0);
    queueWithdrawalActive.set(0);
  }
  const sq = getSettlementQueue();
  if (sq) {
    const counts = await sq.getJobCounts();
    queueSettlementWaiting.set(counts.waiting);
    queueSettlementActive.set(counts.active);
  } else {
    queueSettlementWaiting.set(0);
    queueSettlementActive.set(0);
  }
}

export async function getMetrics(): Promise<string> {
  await updateQueueMetrics();
  return register.metrics();
}

export function getContentType(): string {
  return register.contentType;
}
