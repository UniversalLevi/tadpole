import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Card } from '../components/ui/Card';

export default function Dashboard() {
  const { user } = useAuth();
  const { walletBalance, lastResult } = useSocket();

  const quickLinks = [
    { to: '/wallet', label: 'Wallet', desc: 'Deposit & view balance' },
    { to: '/game', label: 'Game', desc: 'Number prediction (0–9)' },
    { to: '/withdrawal', label: 'Withdraw', desc: 'Request withdrawal' },
  ];

  return (
    <div className="page-container">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-slate-600">Welcome back, {user?.email}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {walletBalance != null && (
          <Card title="Balance">
            <p className="balance-display">₹{walletBalance.available.toFixed(2)}</p>
            <p className="balance-muted">Locked: ₹{walletBalance.locked.toFixed(2)}</p>
          </Card>
        )}
        {lastResult != null && (
          <Card title="Last result">
            <p className="text-slate-700">
              Round result: <strong className="text-teal-600">{lastResult.result}</strong>
            </p>
            <p className="mt-1 text-xs text-slate-500 break-all">Seed: {lastResult.serverSeed}</p>
          </Card>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick actions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map(({ to, label, desc }) => (
            <Link
              key={to}
              to={to}
              className="card block transition hover:border-teal-300 hover:shadow-md"
            >
              <div className="card-body">
                <span className="font-semibold text-slate-900">{label}</span>
                <p className="mt-1 text-sm text-slate-500">{desc}</p>
              </div>
            </Link>
          ))}
          {user?.role === 'admin' && (
            <Link
              to="/admin"
              className="card block border-amber-200 bg-amber-50/50 transition hover:border-amber-300 hover:shadow-md"
            >
              <div className="card-body">
                <span className="font-semibold text-amber-800">Admin</span>
                <p className="mt-1 text-sm text-amber-700">Users, withdrawals, settings</p>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
