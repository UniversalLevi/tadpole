import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import DepositModal from '../components/DepositModal';

type WalletData = { availableBalance: number; lockedBalance: number; currency: string };
type Tx = { _id: string; type: string; amount: number; balanceAfter: number; createdAt: string };

export default function Wallet() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<{ items: Tx[] }>({ items: [] });
  const [depositOpen, setDepositOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  function load() {
    Promise.all([
      api.get<WalletData>('/wallet'),
      api.get<{ items: Tx[] }>('/wallet/transactions?limit=20'),
    ])
      .then(([w, t]) => {
        setWallet(w.data);
        setTransactions(t.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="loading">Loading...</p>;
  if (!wallet) return <p className="loading">Failed to load wallet</p>;

  return (
    <div className="page-card">
      <h1>Wallet</h1>
      <Link to="/dashboard" className="back-link">← Back to Dashboard</Link>
      <div className="wallet-balance">
        <p><strong>Available:</strong> {wallet.currency} {wallet.availableBalance.toFixed(2)}</p>
        <p><strong>Locked:</strong> {wallet.currency} {wallet.lockedBalance.toFixed(2)}</p>
      </div>
      <button type="button" onClick={() => setDepositOpen(true)} className="primary deposit-btn">
        Deposit
      </button>
      {depositOpen && (
        <DepositModal
          onClose={() => {
            setDepositOpen(false);
            load();
          }}
        />
      )}
      <h2>Transaction history</h2>
      <ul className="tx-list">
        {transactions.items.length === 0 && <li>No transactions yet</li>}
        {transactions.items.map((tx) => (
          <li key={tx._id}>
            {tx.type} {tx.amount >= 0 ? '+' : ''}{tx.amount} — Balance: {tx.balanceAfter} — {new Date(tx.createdAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
