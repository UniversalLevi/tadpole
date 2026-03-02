import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useSocket } from '../context/SocketContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function Game() {
  const { round, lastResult, walletBalance, connected, bettingPaused } = useSocket();
  const [prediction, setPrediction] = useState<number>(0);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(round.secondsRemaining);

  useEffect(() => {
    setSecondsRemaining(round.secondsRemaining);
  }, [round.secondsRemaining]);

  useEffect(() => {
    if (round.status !== 'betting' || secondsRemaining <= 0) return;
    const t = setInterval(() => {
      setSecondsRemaining((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [round.status, secondsRemaining]);

  async function handlePlaceBet(e: React.FormEvent) {
    e.preventDefault();
    if (bettingPaused) {
      setError('Betting is temporarily paused');
      return;
    }
    if (!round.roundId) {
      setError('No active round');
      return;
    }
    const num = parseFloat(amount);
    if (Number.isNaN(num) || num < 10 || num > 10000) {
      setError('Amount must be between 10 and 10000 INR');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/bet', { roundId: round.roundId, prediction, amount: num });
      setAmount('');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Bet failed';
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container">
      <Link to="/dashboard" className="text-sm font-medium text-teal-600 hover:text-teal-700">
        ← Back to Dashboard
      </Link>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Number Prediction (0–9)</h1>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            connected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {connected ? 'Live' : 'Connecting…'}
        </span>
      </div>

      {walletBalance != null && (
        <p className="mt-2 text-slate-600">
          Balance: <strong className="text-slate-900">₹{walletBalance.available.toFixed(2)}</strong>
          <span className="text-slate-500"> (locked: ₹{walletBalance.locked.toFixed(2)})</span>
        </p>
      )}

      {bettingPaused && (
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800">
          Betting is temporarily paused. Please try again later.
        </div>
      )}

      {round.roundId ? (
        <Card title={`Round #${round.roundNumber} — ${round.status === 'betting' ? 'Betting open' : 'Closed'}`} className="mt-6">
          {round.status === 'betting' && (
            <p className="text-lg font-semibold text-teal-600 mb-4">
              Time left: {secondsRemaining}s
            </p>
          )}
          {round.status === 'betting' && !bettingPaused && (
            <form onSubmit={handlePlaceBet} className="space-y-4">
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {error}
                </p>
              )}
              <div>
                <label className="label">Prediction (0–9)</label>
                <select
                  value={prediction}
                  onChange={(e) => setPrediction(Number(e.target.value))}
                  className="input"
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <Input
                label="Amount (INR)"
                type="number"
                min={10}
                max={10000}
                step={10}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10 – 10000"
              />
              <Button type="submit" variant="primary" loading={loading}>
                Place bet
              </Button>
            </form>
          )}
        </Card>
      ) : (
        <p className="mt-6 text-slate-600">Waiting for next round…</p>
      )}

      {lastResult && (
        <Card title="Last result" className="mt-8">
          <p className="text-slate-700">
            Result: <strong className="text-teal-600">{lastResult.result}</strong>
          </p>
          <p className="mt-2 text-xs text-slate-500 break-all">Server seed (verify): {lastResult.serverSeed}</p>
        </Card>
      )}
    </div>
  );
}
