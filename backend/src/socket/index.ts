import http from 'node:http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { setPredictionEmitters } from '../engine/emitters.js';
import { setAviatorEmitters } from '../games/aviator/index.js';
import { logWithContext } from '../logs/index.js';
import { WALLET_UPDATES_CHANNEL, BET_CONFIRMED_CHANNEL } from '../lib/walletUpdatesPub.js';

let io: Server | null = null;
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;
let walletUpdatesSub: Redis | null = null;

function createRedisClients(): { pub: Redis; sub: Redis } | null {
  const url = config.redisUrl;
  if (!url || url === '') return null;
  try {
    const pub = new Redis(url, { maxRetriesPerRequest: null });
    const sub = new Redis(url, { maxRetriesPerRequest: null });
    return { pub, sub };
  } catch (e) {
    logWithContext('warn', 'Redis clients for Socket.IO adapter failed', { error: e instanceof Error ? e.message : e });
    return null;
  }
}

export function initSocket(httpServer: http.Server): Server {
  io = new Server(httpServer, {
    cors: { origin: config.frontendOrigin, credentials: true },
  });
  const redisClients = createRedisClients();
  if (redisClients) {
    redisPub = redisClients.pub;
    redisSub = redisClients.sub;
    io.adapter(createAdapter(redisPub, redisSub));
    logWithContext('info', 'Socket.IO Redis adapter enabled');
    const url = config.redisUrl;
    if (url && url !== '') {
      try {
        walletUpdatesSub = new Redis(url, { maxRetriesPerRequest: null });
        walletUpdatesSub.subscribe(WALLET_UPDATES_CHANNEL);
        walletUpdatesSub.on('message', (channel: string, message: string) => {
          if (channel === WALLET_UPDATES_CHANNEL) {
            try {
              const data = JSON.parse(message) as { userId: string; availableBalance: number; lockedBalance: number };
              io?.to(`user:${data.userId}`).emit('wallet:update', { availableBalance: data.availableBalance, lockedBalance: data.lockedBalance });
            } catch {
              // ignore
            }
            return;
          }
          if (channel === BET_CONFIRMED_CHANNEL) {
            try {
              const data = JSON.parse(message) as { userId: string; betId: string; roundId: string; prediction: number; amount: number };
              io?.to(`user:${data.userId}`).emit('bet:confirmed', { betId: data.betId, roundId: data.roundId, prediction: data.prediction, amount: data.amount });
            } catch {
              // ignore
            }
          }
        });
        walletUpdatesSub.subscribe(BET_CONFIRMED_CHANNEL);
      } catch (e) {
        logWithContext('warn', 'Wallet updates Redis subscriber failed', { error: e instanceof Error ? e.message : e });
      }
    }
  }
  const predictionRoom = 'game';
  const aviatorRoom = 'game:aviator';
  io.on('connection', (socket: Socket) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
    let userId: string | null = null;
    if (token && typeof token === 'string') {
      try {
        const payload = jwt.verify(token, config.jwtAccessSecret) as { sub: string };
        userId = payload.sub;
        socket.data.userId = userId;
      } catch {
        socket.disconnect(true);
        return;
      }
    }
    socket.join(predictionRoom);
    if (userId) socket.join(`user:${userId}`);
    socket.on('aviator:join', () => socket.join(aviatorRoom));
    socket.on('aviator:leave', () => socket.leave(aviatorRoom));
    socket.on('disconnect', () => {});
  });
  setPredictionEmitters({
    roundStarted: (payload) => io?.to(predictionRoom).emit('round:started', payload),
    roundTimer: (payload) => io?.to(predictionRoom).emit('round:timer', payload),
    roundClosed: (payload) => io?.to(predictionRoom).emit('round:closed', payload),
    roundResult: (payload) => io?.to(predictionRoom).emit('round:result', payload),
    walletUpdate: (userId: string, payload: { availableBalance: number; lockedBalance: number }) => {
      io?.to(`user:${userId}`).emit('wallet:update', payload);
    },
  });
  setAviatorEmitters({
    countdown: (payload) => io?.to(aviatorRoom).emit('aviator:countdown', payload),
    roundStarted: (payload) => io?.to(aviatorRoom).emit('aviator:round:started', payload),
    tick: (payload) => io?.to(aviatorRoom).volatile.emit('aviator:tick', payload),
    crashed: (payload) => io?.to(aviatorRoom).emit('aviator:round:crashed', payload),
  });
  return io;
}

export function getIo(): Server | null {
  return io;
}

export function emitBetConfirmed(userId: string, payload: { betId: string; roundId: string; prediction: number; amount: number }): void {
  io?.to(`user:${userId}`).emit('bet:confirmed', payload);
}
