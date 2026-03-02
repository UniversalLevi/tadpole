import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

type WithdrawalRow = { _id: string; amount: number; status: string; requestedAt: string };
type Limits = { minWithdrawalAmount: number; withdrawalCooldownMs: number; maxWithdrawalsPerDay: number };

export default function Withdrawal() {
  const [amount, setAmount] = useState('');
  const [list, setList] = useState<WithdrawalRow[]>([]);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function load() {
    api.get<WithdrawalRow[]>('/withdrawal/requests').then((res) => setList(res.data)).catch(() => {});
    api.get<Limits>('/withdrawal/limits').then((res) => setLimits(res.data)).catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(amount);
    const min = limits?.minWithdrawalAmount ?? 100;
    if (!num || num < min) {
      setError(`Minimum withdrawal is ${min} INR`);
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/withdrawal/request', { amount: num });
      setAmount('');
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Request failed';
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

      <h1 className="mt-6 text-2xl font-bold text-slate-900">Withdraw</h1>
      {limits && (
        <p className="mt-1 text-sm text-slate-500">
          Min ₹{limits.minWithdrawalAmount} · Max {limits.maxWithdrawalsPerDay} per day
        </p>
      )}

      <Card title="Request withdrawal" className="mt-6 max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <Input
            label="Amount (INR)"
            type="number"
            step="0.01"
            min={limits?.minWithdrawalAmount ?? 100}
            placeholder={`Min ${limits?.minWithdrawalAmount ?? 100}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button type="submit" variant="primary" loading={loading}>
            Request withdrawal
          </Button>
        </form>
      </Card>

      <Card title="Your withdrawal requests" className="mt-8">
        {list.length === 0 ? (
          <p className="text-slate-500">No requests yet</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {list.map((r) => (
              <li key={r._id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                <span className="font-medium text-slate-700">₹{r.amount.toFixed(2)}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    r.status === 'pending'
                      ? 'bg-amber-100 text-amber-800'
                      : r.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {r.status}
                </span>
                <span className="w-full text-sm text-slate-500 sm:w-auto">
                  {new Date(r.requestedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
