import Redis from 'ioredis';
import { config } from '../config/index.js';

const CHANNEL = 'wallet:updates';

let publishClient: Redis | null = null;

function getPublishClient(): Redis | null {
  if (publishClient) return publishClient;
  const url = config.redisUrl;
  if (!url || url === '') return null;
  try {
    publishClient = new Redis(url, { maxRetriesPerRequest: 3 });
    return publishClient;
  } catch {
    return null;
  }
}

/**
 * Publish a wallet update to Redis so that API/socket servers can emit to the user.
 * Used by the settlement worker (separate process) to notify connected clients.
 */
export function publishWalletUpdate(userId: string, payload: { availableBalance: number; lockedBalance: number }): void {
  const client = getPublishClient();
  if (!client) return;
  const message = JSON.stringify({ userId, ...payload });
  client.publish(CHANNEL, message).catch(() => {});
}

export async function closeWalletUpdatesPub(): Promise<void> {
  if (publishClient) {
    await publishClient.quit();
    publishClient = null;
  }
}

export { CHANNEL as WALLET_UPDATES_CHANNEL };

const BET_CONFIRMED_CHANNEL = 'bet:confirmed';

export function publishBetConfirmed(payload: { userId: string; betId: string; roundId: string; prediction: number; amount: number }): void {
  const client = getPublishClient();
  if (!client) return;
  client.publish(BET_CONFIRMED_CHANNEL, JSON.stringify(payload)).catch(() => {});
}

export { BET_CONFIRMED_CHANNEL };
