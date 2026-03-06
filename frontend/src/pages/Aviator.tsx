import { useEffect, useMemo, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { api } from '../api/client';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

type AviatorState = {
  phase: 'countdown' | 'betting' | 'running' | 'crashed' | 'idle';
  roundId: string | null;
  roundNumber: number;
  bettingClosesAt: string | null;
  serverSeedHash: string | null;
  multiplier: number;
  crashed?: { crashPoint: number; serverSeed: string };
};

type CrashItem = { roundNumber: number; crashPoint: number; crashedAt: string };

type RoundPlayers = { activeCount: number; recentCashouts: Array<{ multiplier: number; payout: number }> };

export default function Aviator() {
  const { user } = useAuth();
  const { connected, reconnecting, getSocket, walletBalance } = useSocket();
  const [engineState, setEngineState] = useState<AviatorState | null>(null);
  const [lastCrashes, setLastCrashes] = useState<CrashItem[]>([]);
  const [betAmount, setBetAmount] = useState('10');
  const [autoCashout, setAutoCashout] = useState('');
  const [betId, setBetId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [cashing, setCashing] = useState(false);
  const [message, setMessage] = useState('');
  const [multiplierTick, setMultiplierTick] = useState(false);
  const [roundPlayers, setRoundPlayers] = useState<RoundPlayers>({ activeCount: 0, recentCashouts: [] });
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const multiplierText = useMemo(() => {
    const m = engineState?.multiplier ?? 1;
    return `${m.toFixed(2)}x`;
  }, [engineState?.multiplier]);

  function load() {
    api.get<AviatorState>('/aviator/state').then((r) => setEngineState(r.data)).catch(() => {});
    api.get<{ items: CrashItem[] }>('/aviator/last-crashes?limit=20').then((r) => setLastCrashes(r.data.items ?? [])).catch(() => setLastCrashes([]));
  }

  useEffect(() => {
    load();
  }, []);

  // Resync state when socket (re)connects so data is fresh
  useEffect(() => {
    if (connected) {
      load();
    }
  }, [connected]);

  // Poll live players when round is betting or running
  useEffect(() => {
    const phase = engineState?.phase ?? 'idle';
    if (phase !== 'betting' && phase !== 'running') {
      setRoundPlayers({ activeCount: 0, recentCashouts: [] });
      return;
    }
    const fetchPlayers = () => {
      api.get<RoundPlayers>('/aviator/players').then((r) => setRoundPlayers(r.data)).catch(() => {});
    };
    fetchPlayers();
    const interval = setInterval(fetchPlayers, 2000);
    return () => clearInterval(interval);
  }, [engineState?.phase, engineState?.roundId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('aviator:join');

    const onCountdown = (_p: { msRemaining: number }) => {
      setEngineState((prev) => ({
        phase: 'countdown',
        roundId: null,
        roundNumber: prev?.roundNumber ?? 0,
        bettingClosesAt: null,
        serverSeedHash: null,
        multiplier: 1,
      }));
      setMessage('');
    };
    const onRoundStarted = (p: { roundId: string; roundNumber: number; bettingClosesAt: string; serverSeedHash: string }) => {
      setEngineState({
        phase: 'betting',
        roundId: p.roundId,
        roundNumber: p.roundNumber,
        bettingClosesAt: p.bettingClosesAt,
        serverSeedHash: p.serverSeedHash,
        multiplier: 1,
      });
      setMessage('');
      setBetId(null);
    };
    const onTick = (p: { roundId: string; multiplier: number }) => {
      setEngineState((prev) => {
        if (!prev || prev.roundId !== p.roundId) return prev;
        return { ...prev, phase: 'running', multiplier: p.multiplier };
      });
      setMultiplierTick(true);
      if (tickRef.current) clearTimeout(tickRef.current);
      tickRef.current = setTimeout(() => {
        setMultiplierTick(false);
        tickRef.current = null;
      }, 120);
    };
    const onCrashed = (p: { roundId: string; crashPoint: number; serverSeed: string }) => {
      setEngineState((prev) => {
        if (!prev || prev.roundId !== p.roundId) return prev;
        return { ...prev, phase: 'crashed', multiplier: p.crashPoint, crashed: { crashPoint: p.crashPoint, serverSeed: p.serverSeed } };
      });
      setBetId(null);
      load();
    };

    socket.on('aviator:countdown', onCountdown);
    socket.on('aviator:round:started', onRoundStarted);
    socket.on('aviator:tick', onTick);
    socket.on('aviator:round:crashed', onCrashed);

    return () => {
      if (tickRef.current) clearTimeout(tickRef.current);
      socket.off('aviator:countdown', onCountdown);
      socket.off('aviator:round:started', onRoundStarted);
      socket.off('aviator:tick', onTick);
      socket.off('aviator:round:crashed', onCrashed);
      socket.emit('aviator:leave');
    };
  }, [getSocket, connected]);

  if (user?.role === 'admin') return <Navigate to="/admin" replace />;

  const phase = engineState?.phase ?? 'idle';
  const canPlace = phase === 'betting';
  const canCashout = phase === 'running' && betId != null;

  async function placeBet() {
    setMessage('');
    const amt = Number(betAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setMessage('Enter a valid amount');
      return;
    }
    const ac = autoCashout.trim() ? Number(autoCashout) : undefined;
    if (autoCashout.trim() && (!Number.isFinite(ac) || (ac ?? 0) < 1.01)) {
      setMessage('Auto cashout must be >= 1.01');
      return;
    }
    setPlacing(true);
    try {
      const res = await api.post<{ betId: string }>('/aviator/bet', { betAmount: amt, autoCashout: ac });
      setBetId(res.data.betId);
      setMessage('Bet placed');
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Bet failed';
      setMessage(String(msg) || 'Bet failed');
    } finally {
      setPlacing(false);
    }
  }

  async function cashout() {
    if (!betId) return;
    setMessage('');
    setCashing(true);
    try {
      const res = await api.post<{ payout: number; multiplier: number }>('/aviator/cashout', { betId });
      setMessage(`Cashed out at ${res.data.multiplier.toFixed(2)}x → ₹${res.data.payout.toFixed(2)}`);
      setBetId(null);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Cashout failed';
      setMessage(String(msg) || 'Cashout failed');
    } finally {
      setCashing(false);
    }
  }

  const connectionLabel = connected ? 'Live' : reconnecting ? 'Reconnecting…' : 'Connecting…';

  return (
    <div className="page-container overflow-x-hidden">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Aviator</h2>
          <p className="mt-0.5 text-sm text-slate-600">Cash out before it crashes.</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            connected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
          title={connectionLabel}
        >
          {connectionLabel}
        </span>
      </div>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-200 px-5 py-5 md:px-6">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Multiplier</p>
          <div className="mt-2 flex flex-col items-center justify-center min-h-[5.5rem] gap-3">
            {phase === 'running' && (
              <div className="relative w-full max-w-xs h-12 rounded-full bg-slate-200/80 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-75 ease-out"
                  style={{ width: `${Math.min(100, ((engineState?.multiplier ?? 1) - 1) * 12.5)}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 transition-all duration-75 ease-out"
                  style={{ left: `calc(${Math.min(100, ((engineState?.multiplier ?? 1) - 1) * 12.5)}% - 20px)` }}
                  aria-hidden
                >
                  <svg viewBox="0 0 24 24" className="w-10 h-10 text-slate-800 drop-shadow-sm" fill="currentColor">
                    <path d="M12 2L4 20h4l2-6h4l2 6h4L12 2zm0 4.5l1.5 4.5h-3l1.5-4.5z" />
                  </svg>
                </div>
              </div>
            )}
            <span
              className={`text-5xl md:text-7xl font-bold tabular-nums transition-transform duration-75 ${
                phase === 'crashed' ? 'text-red-600' : 'text-teal-600'
              } ${multiplierTick && phase === 'running' ? 'scale-105' : 'scale-100'}`}
            >
              {multiplierText}
            </span>
          </div>
          <p className="text-center text-sm text-slate-600 mt-2">
            {phase === 'countdown' ? 'Next round starting…' : phase === 'betting' ? 'Betting open' : phase === 'running' ? 'Running…' : phase === 'crashed' ? 'Crashed' : 'Loading…'}
          </p>
        </div>
        <div className="card-body">
          {engineState?.serverSeedHash && (
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-800 list-none flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform">▸</span> Provably fair (server seed hash)
              </summary>
              <p className="mt-2 text-xs text-slate-500 break-all font-mono bg-slate-50 rounded-lg p-3">
                {engineState.serverSeedHash}
              </p>
              {engineState.phase === 'crashed' && engineState.crashed && (
                <p className="mt-2 text-xs text-slate-500 break-all font-mono bg-slate-50 rounded-lg p-3">
                  Seed: {engineState.crashed.serverSeed} · Crash: {engineState.crashed.crashPoint.toFixed(2)}x
                </p>
              )}
            </details>
          )}
        </div>
      </Card>

      <Card title="Bet panel" className="mt-6 sticky bottom-4 z-10 shadow-lg md:static md:shadow-none">
        <div className="space-y-4">
          {walletBalance != null && (
            <p className="text-sm text-slate-600">
              Balance: <span className="font-semibold tabular-nums text-slate-900">₹{walletBalance.available.toFixed(2)}</span>
              {walletBalance.locked > 0 && <span className="text-slate-500"> (₹{walletBalance.locked.toFixed(2)} locked)</span>}
            </p>
          )}
          {message && <p className="text-sm text-slate-700">{message}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Amount (INR)</label>
              <input className="input mt-1 w-full min-h-[44px]" type="number" min={1} value={betAmount} onChange={(e) => setBetAmount(e.target.value)} />
            </div>
            <div>
              <label className="label">Auto cashout (optional)</label>
              <input className="input mt-1 w-full min-h-[44px]" type="number" min={1.01} step={0.01} value={autoCashout} onChange={(e) => setAutoCashout(e.target.value)} placeholder="e.g. 2.00" />
            </div>
            <div className="flex items-end gap-2">
              <Button type="button" variant="primary" loading={placing} disabled={!canPlace} className="min-h-[44px] w-full" onClick={placeBet}>
                {canPlace ? 'Place bet' : 'Betting closed'}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" loading={cashing} disabled={!canCashout} className="min-h-[44px]" onClick={cashout}>
              Cash out
            </Button>
            {betId && <span className="text-xs text-slate-500 font-mono">Bet: {betId.slice(-6)}</span>}
          </div>
        </div>
      </Card>

      {(phase === 'betting' || phase === 'running') && (
        <Card className="mt-6" title="Live players">
          <p className="text-sm text-slate-600">
            <span className="font-semibold tabular-nums">{roundPlayers.activeCount}</span> player{roundPlayers.activeCount !== 1 ? 's' : ''} in
          </p>
          {roundPlayers.recentCashouts.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Recent cashouts</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {roundPlayers.recentCashouts.map((c, i) => (
                  <li key={i} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-sm font-medium text-emerald-800 tabular-nums">
                    {c.multiplier.toFixed(2)}x → ₹{c.payout.toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {lastCrashes.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-medium text-slate-700 mb-2">Last crash points</p>
          <div className="flex gap-2 overflow-x-auto pb-2 -webkit-overflow-scrolling-touch scrollbar-thin">
            {lastCrashes.map((c) => (
              <div key={c.roundNumber} className="flex-shrink-0 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-center min-w-[5rem] shadow-sm">
                <span className="text-xs font-medium text-slate-500 block">#{c.roundNumber}</span>
                <span className="text-lg font-bold tabular-nums text-slate-800 mt-0.5 block">{Number(c.crashPoint).toFixed(2)}x</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

