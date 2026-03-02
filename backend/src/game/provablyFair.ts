import crypto from 'node:crypto';

export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashServerSeed(serverSeed: string): string {
  return crypto.createHash('sha256').update(serverSeed).digest('hex');
}

/**
 * Deterministic result 0-9 from serverSeed and roundNumber.
 * result = hash(serverSeed + roundNumber) % 10
 */
export function computeResult(serverSeed: string, roundNumber: number): number {
  const input = serverSeed + String(roundNumber);
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  const value = parseInt(hash.slice(0, 8), 16);
  return value % 10;
}
