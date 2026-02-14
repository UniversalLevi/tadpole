import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api/client';

type WalletData = { availableBalance: number; lockedBalance: number; currency: string };
type Tx = { _id: string; type: string; amount: number; createdAt: string };
type UserData = { _id: string; email: string; role: string; isFrozen: boolean };

export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<UserData | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [freezing, setFreezing] = useState(false);

  function load() {
    if (!userId) return;
    api.get<UserData>(`/admin/users/${userId}`).then((res) => setUser(res.data)).catch(() => {});
    api.get<WalletData>(`/admin/users/${userId}/wallet`).then((res) => setWallet(res.data)).catch(() => {});
    api.get<{ items: Tx[] }>(`/admin/users/${userId}/transactions?limit=50`).then((res) => setTransactions(res.data.items)).catch(() => {});
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
    const num = parseFloat(adjustAmount);
    if (!userId || isNaN(num)) return;
    try {
      await api.post('/admin/wallet/adjustment', { userId, amount: num, reason: adjustReason });
      setAdjustAmount('');
      setAdjustReason('');
      load();
    } catch {
      // show error in UI if needed
    }
  }

  if (!user) return <p className="loading">Loading...</p>;

  return (
    <div className="page-card">
      <h1>User: {user.email}</h1>
      <Link to="/admin">Back to Users</Link>
      <p>Role: {user.role} | Frozen: {user.isFrozen ? 'Yes' : 'No'}</p>
      <button onClick={handleFreeze} disabled={freezing}>
        {user.isFrozen ? 'Unfreeze' : 'Freeze'} user
      </button>
      {wallet && (
        <div>
          <h2>Wallet</h2>
          <p>Available: {wallet.currency} {wallet.availableBalance}</p>
          <p>Locked: {wallet.lockedBalance}</p>
        </div>
      )}
      <form onSubmit={handleAdjust}>
        <h3>Adjust balance</h3>
        <input
          type="number"
          step="0.01"
          placeholder="Amount (+ or -)"
          value={adjustAmount}
          onChange={(e) => setAdjustAmount(e.target.value)}
        />
        <input
          type="text"
          placeholder="Reason"
          value={adjustReason}
          onChange={(e) => setAdjustReason(e.target.value)}
        />
        <button type="submit">Apply</button>
      </form>
      <h2>Transactions</h2>
      <ul>
        {transactions.map((tx) => (
          <li key={tx._id}>{tx.type} {tx.amount} — {new Date(tx.createdAt).toLocaleString()}</li>
        ))}
      </ul>
    </div>
  );
}
