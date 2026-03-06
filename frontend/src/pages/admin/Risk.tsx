import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card } from '../../components/ui/Card';

type HighRiskUser = {
  userId: string;
  email: string;
  riskScore: number;
  riskScoreUpdatedAt?: string;
  withdrawalsPausedByRisk?: boolean;
};

type FraudAlert = {
  _id: string;
  userId?: string;
  email?: string;
  flagType: string;
  severity: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

type FailedPayout = {
  _id: string;
  userId?: string;
  email?: string;
  amount: number;
  failureReason?: string;
  attemptCount?: number;
  processedAt?: string;
};

type RiskOverview = {
  highRiskUsers: HighRiskUser[];
  withdrawalQueue: { pending: number; processing: number };
  fraudAlerts: FraudAlert[];
  failedPayouts: FailedPayout[];
  depositTrends: { volume24h: number; last7Days: Record<string, number> };
  lastReconciliation: { runAt: string; status: string; summary?: unknown } | null;
};

export default function AdminRisk() {
  const [data, setData] = useState<RiskOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<RiskOverview>('/admin/risk/overview')
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" aria-hidden />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-container">
        <p className="text-slate-600">Failed to load risk overview.</p>
      </div>
    );
  }

  const { highRiskUsers, withdrawalQueue, fraudAlerts, failedPayouts, depositTrends, lastReconciliation } = data;

  return (
    <div className="page-container space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Risk & Operations</h1>
      <p className="text-slate-600">High-risk users, withdrawal queue, fraud alerts, and payment health.</p>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm font-medium text-slate-500">High-risk users</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{highRiskUsers.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-slate-500">Withdrawal queue</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {withdrawalQueue.pending} pending, {withdrawalQueue.processing} processing
          </p>
          <Link to="/admin/withdrawals" className="mt-2 text-sm font-medium text-amber-700 hover:underline">
            View queue →
          </Link>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-slate-500">Deposits (24h)</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">₹{depositTrends.volume24h.toFixed(2)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-slate-500">Last reconciliation</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {lastReconciliation
              ? `${lastReconciliation.status} at ${new Date(lastReconciliation.runAt).toLocaleString()}`
              : 'Never run'}
          </p>
        </Card>
      </div>

      <Card>
        <h2 className="border-b border-slate-200 px-4 py-3 text-lg font-semibold text-slate-900">High-risk users</h2>
        {highRiskUsers.length === 0 ? (
          <p className="px-4 py-6 text-slate-500">No high-risk users.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700">Email</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700">Risk score</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700">Withdrawals paused</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {highRiskUsers.map((u) => (
                  <tr key={u.userId}>
                    <td className="px-4 py-2">
                      <Link to={`/admin/users/${u.userId}`} className="font-medium text-amber-700 hover:underline">
                        {u.email}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono">{u.riskScore}</td>
                    <td className="px-4 py-2">{u.withdrawalsPausedByRisk ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="border-b border-slate-200 px-4 py-3 text-lg font-semibold text-slate-900">Recent fraud alerts</h2>
        {fraudAlerts.length === 0 ? (
          <p className="px-4 py-6 text-slate-500">No fraud alerts.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700">User</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700">Type</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700">Severity</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {fraudAlerts.map((f) => (
                  <tr key={f._id}>
                    <td className="px-4 py-2">{f.email ?? f.userId ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-sm">{f.flagType}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          f.severity === 'high'
                            ? 'bg-red-100 text-red-800'
                            : f.severity === 'medium'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {f.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{new Date(f.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="border-b border-slate-200 px-4 py-3 text-lg font-semibold text-slate-900">Failed payouts</h2>
        {failedPayouts.length === 0 ? (
          <p className="px-4 py-6 text-slate-500">No failed payouts.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700">User</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700">Amount</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700">Attempts</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700">Reason</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {failedPayouts.map((w) => (
                  <tr key={w._id}>
                    <td className="px-4 py-2">{w.email ?? w.userId ?? '—'}</td>
                    <td className="px-4 py-2 font-medium">₹{w.amount.toFixed(2)}</td>
                    <td className="px-4 py-2">{w.attemptCount ?? 0}</td>
                    <td className="max-w-[200px] truncate px-4 py-2 text-sm text-slate-600" title={w.failureReason}>
                      {w.failureReason ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {w.processedAt ? new Date(w.processedAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
