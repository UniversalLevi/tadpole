import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api } from '../api/client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

type RoundState = {
  roundId: string | null;
  roundNumber: number;
  status: string;
  bettingClosesAt: string | null;
  serverSeedHash: string | null;
  totalBetAmount: number;
  secondsRemaining: number;
};

type LastResult = {
  roundId: string;
  result: number;
  serverSeed: string;
} | null;

type SocketContextType = {
  round: RoundState;
  lastResult: LastResult;
  walletBalance: { available: number; locked: number } | null;
  connected: boolean;
  bettingPaused: boolean;
};

const defaultRound: RoundState = {
  roundId: null,
  roundNumber: 0,
  status: '',
  bettingClosesAt: null,
  serverSeedHash: null,
  totalBetAmount: 0,
  secondsRemaining: 0,
};

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [round, setRound] = useState<RoundState>(defaultRound);
  const [lastResult, setLastResult] = useState<LastResult>(null);
  const [walletBalance, setWalletBalance] = useState<{ available: number; locked: number } | null>(null);
  const [connected, setConnected] = useState(false);
  const [bettingPaused, setBettingPaused] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback((token: string) => {
    if (socketRef.current?.connected) return;
    const s = io(API_BASE, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    s.on('connect', () => {
      setConnected(true);
      api.get<{ round: Record<string, unknown> | null; bettingPaused?: boolean }>('/game/current-round').then((res) => {
        const r = res.data.round;
        if (typeof res.data.bettingPaused === 'boolean') setBettingPaused(res.data.bettingPaused);
        if (r && r._id) {
          const closesAt = r.bettingClosesAt as string;
          setRound({
            roundId: String(r._id),
            roundNumber: Number(r.roundNumber),
            status: String(r.status),
            bettingClosesAt: closesAt ?? null,
            serverSeedHash: (r.serverSeedHash as string) ?? null,
            totalBetAmount: Number(r.totalBetAmount ?? 0),
            secondsRemaining: closesAt ? Math.max(0, Math.ceil((new Date(closesAt).getTime() - Date.now()) / 1000)) : 0,
          });
        }
      }).catch(() => {});
    });
    s.on('disconnect', () => setConnected(false));
    s.on('round:started', (payload: { roundId: string; roundNumber: number; bettingClosesAt: string; serverSeedHash: string }) => {
      setRound((prev) => ({
        ...prev,
        roundId: payload.roundId,
        roundNumber: payload.roundNumber,
        status: 'betting',
        bettingClosesAt: payload.bettingClosesAt,
        serverSeedHash: payload.serverSeedHash,
        totalBetAmount: 0,
        secondsRemaining: Math.max(0, Math.ceil((new Date(payload.bettingClosesAt).getTime() - Date.now()) / 1000)),
      }));
    });
    s.on('round:timer', (payload: { roundId: string; secondsRemaining: number }) => {
      setRound((prev) => (prev.roundId === payload.roundId ? { ...prev, secondsRemaining: payload.secondsRemaining } : prev));
    });
    s.on('round:closed', (payload: { roundId: string }) => {
      setRound((prev) => (prev.roundId === payload.roundId ? { ...prev, status: 'closed' } : prev));
    });
    s.on('round:result', (payload: { roundId: string; result: number; serverSeed: string }) => {
      setLastResult({ roundId: payload.roundId, result: payload.result, serverSeed: payload.serverSeed });
      setRound(defaultRound);
    });
    s.on('wallet:update', (payload: { availableBalance: number; lockedBalance: number }) => {
      setWalletBalance({ available: payload.availableBalance, locked: payload.lockedBalance });
    });
    socketRef.current = s;
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) connect(token);
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [connect]);

  return (
    <SocketContext.Provider value={{ round, lastResult, walletBalance, connected, bettingPaused }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
