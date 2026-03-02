import http from 'node:http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { setSchedulerEmitters } from '../scheduler/roundScheduler.js';
let io: Server | null = null;

export function initSocket(httpServer: http.Server): Server {
  io = new Server(httpServer, {
    cors: { origin: config.frontendOrigin, credentials: true },
  });
  const gameRoom = 'game';
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
    socket.join(gameRoom);
    socket.on('disconnect', () => {});
  });
  setSchedulerEmitters({
    roundStarted: (payload) => io?.to('game').emit('round:started', payload),
    roundTimer: (payload) => io?.to('game').emit('round:timer', payload),
    roundClosed: (payload) => io?.to('game').emit('round:closed', payload),
    roundResult: (payload) => io?.to('game').emit('round:result', payload),
    walletUpdate: async (userId: string, payload: { availableBalance: number; lockedBalance: number }) => {
      const sockets = await io?.fetchSockets() ?? [];
      for (const s of sockets) {
        if (s.data.userId === userId) s.emit('wallet:update', payload);
      }
    },
  });
  return io;
}

export function getIo(): Server | null {
  return io;
}

export function emitBetConfirmed(userId: string, payload: { betId: string; roundId: string; prediction: number; amount: number }): void {
  io?.fetchSockets().then((sockets) => {
    for (const s of sockets ?? []) {
      if (s.data.userId === userId) s.emit('bet:confirmed', payload);
    }
  });
}
