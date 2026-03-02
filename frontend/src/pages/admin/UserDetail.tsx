import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

type WalletData = { availableBalance: number; lockedBalance: number; currency: string };
type Tx = { _id: string; type: string; amount: number; balanceAfter: number; createdAt: string };
type UserData = { _id: string; email: string; role: string; isFrozen: boolean };
type BetRow = { _id: string; prediction: number; amount: number; status: string; roundId?: { roundNumber?: number; result?: number } };

export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<UserData | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [bets, setBets] = useState<BetRow[]>([]);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [freezing, setFreezing] = useState(false);
  const [adjustError, setAdjustError] = useState('');

  function load() {
    if (!userId) return;
    api.get<UserData>(`/admin/users/${userId}`).then((res) => setUser(res.data)).catch(() => {});
    api.get<WalletData>(`/admin/users/${userId}/wallet`).then((res) => setWallet(res.data)).catch(() => {});
    api.get<{ items: Tx[] }>(`/admin/users/${userId}/transactions?limit=50`).then((res) => setTransactions(res.data.items)).catch(() => {});
    api.get<{ items: BetRow[] }>(`/admin/users/${userId}/bets?limit=50`).then((res) => setBets(res.data.items)).catch(() => {});
  }

  useEffect(() => {
    load();
  }, [userId]);

  async function handleFreeze() {
    if (!user) return;
    setFreezing(true);
    try {
      await api.patch(`/admin/users/${userId}/freeze`, { freeze: !user.isFrozen });
      load();
    } finally {
      setFreezing(false);
    }
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    setAdjustError('');
    const num = parseFloat(adjustAmount);
    if (!userId || Number.isNaN(num)) return;
    try {
      await api.post('/admin/wallet/adjustment', { userId, amount: num, reason: adjustReason });
      setAdjustAmount('');
      setAdjustReason('');
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Adjustment failed';
      setAdjustError(String(msg));
    }
  }

  if (!user) {
    return (
      <div className="page-container flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <Link to="/admin" className="text-sm font-medium text-teal-600 hover:text-teal-700">← Back to Users</Link>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{user.email}</h1>
          <p className="mt-1 text-slate-600">Role: {user.role} · Frozen: {user.isFrozen ? 'Yes' : 'No'}</p>
        </div>
        <Button variant={user.isFrozen ? 'primary' : 'danger'} onClick={handleFreeze} loading={freezing}>
          {user.isFrozen ? 'Unfreeze' : 'Freeze'} user
        </Button>
      </div>
      {wallet && (
        <Card title="Wallet" className="mt-8">
          <p className="balance-display">{wallet.currency} {wallet.availableBalance.toFixed(2)}</p>
          <p className="balance-muted">Locked: {wallet.lockedBalance.toFixed(2)}</p>
        </Card>
      )}
      <Card title="Adjust balance" className="mt-6 max-w-md">
        <form onSubmit={handleAdjust} className="space-y-4">
          {adjustError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{adjustError}</p>}
          <Input label="Amount" type="number" step="0.01" placeholder="+ or -" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} />
          <Input label="Reason" placeholder="Optional" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
      </Card>
      <Card title="Transactions" className="mt-8">
        {transactions.length === 0 ? <p className="text-slate-500">No transactions</p> : (
          <ul className="divide-y divide-slate-200">
            {transactions.map((tx) => (
              <li key={tx._id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="font-medium text-slate-700">{tx.type}</span>
                <span>{tx.amount >= 0 ? '+' : ''}{tx.amount} → {tx.balanceAfter}</span>
                <span className="text-slate-500 w-full sm:w-auto">{new Date(tx.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Bet history" className="mt-8">
        {bets.length === 0 ? <p className="text-slate-500">No bets</p> : (
          <ul className="divide-y divide-slate-200">
            {bets.map((b) => (
              <li key={b._id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span>Round #{typeof b.roundId === 'object' && b.roundId?.roundNumber != null ? b.roundId.roundNumber : '—'}</span>
                <span>Prediction: {b.prediction} · ₹{b.amount}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.status === 'won' ? 'bg-emerald-100 text-emerald-800' : b.status === 'lost' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`}>{b.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
