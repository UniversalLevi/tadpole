import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import DepositModal from '../components/DepositModal';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

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

  if (loading) {
    return (
      <div className="page-container flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }
  if (!wallet) {
    return (
      <div className="page-container">
        <p className="text-red-600">Failed to load wallet</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <Link to="/dashboard" className="text-sm font-medium text-teal-600 hover:text-teal-700">
        ← Back to Dashboard
      </Link>

      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <Card title="Balance" className="flex-1">
          <p className="balance-display">{wallet.currency} {wallet.availableBalance.toFixed(2)}</p>
          <p className="balance-muted">Available</p>
          <p className="mt-2 text-slate-600">Locked: {wallet.currency} {wallet.lockedBalance.toFixed(2)}</p>
        </Card>
        <div className="flex gap-3">
          <Button variant="primary" onClick={() => setDepositOpen(true)}>
            Deposit
          </Button>
          <Link to="/withdrawal">
            <Button variant="secondary">Withdraw</Button>
          </Link>
        </div>
      </div>

      {depositOpen && (
        <DepositModal
          onClose={() => {
            setDepositOpen(false);
            load();
          }}
        />
      )}

      <Card title="Transaction history" className="mt-8">
        {transactions.items.length === 0 ? (
          <p className="text-slate-500">No transactions yet</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {transactions.items.map((tx) => (
              <li key={tx._id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                <span className="font-medium text-slate-700">{tx.type}</span>
                <span className={tx.amount >= 0 ? 'text-emerald-600' : 'text-slate-600'}>
                  {tx.amount >= 0 ? '+' : ''}{tx.amount} → {tx.balanceAfter}
                </span>
                <span className="w-full text-sm text-slate-500 sm:w-auto">
                  {new Date(tx.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
