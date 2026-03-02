import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

type WithdrawalRow = {
  _id: string;
  userId: { _id?: string; email?: string } | string;
  amount: number;
  status: string;
  requestedAt: string;
};

export default function AdminWithdrawals() {
  const [list, setList] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  function load() {
    api.get<WithdrawalRow[]>('/admin/withdrawals').then((res) => setList(res.data)).catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(id: string) {
    setLoading((l) => ({ ...l, [id]: true }));
    try {
      await api.post(`/admin/withdrawals/${id}/approve`);
      load();
    } finally {
      setLoading((l) => ({ ...l, [id]: false }));
    }
  }

  async function reject(id: string) {
    setLoading((l) => ({ ...l, [id]: true }));
    try {
      await api.post(`/admin/withdrawals/${id}/reject`);
      load();
    } finally {
      setLoading((l) => ({ ...l, [id]: false }));
    }
  }

  const email = (r: WithdrawalRow) =>
    typeof r.userId === 'object' && r.userId && 'email' in r.userId ? r.userId.email : String(r.userId);

  return (
    <div className="page-container">
      <h1 className="text-2xl font-bold text-slate-900">Withdrawal requests</h1>
      <p className="mt-1 text-slate-600">Approve or reject pending withdrawals</p>

      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">User</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Amount</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Requested</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {list.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No withdrawal requests</td>
              </tr>
            ) : (
              list.map((r) => (
                <tr key={r._id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-900">{email(r)}</td>
                  <td className="px-4 py-3 font-medium">₹{r.amount.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === 'pending' ? 'bg-amber-100 text-amber-800' : r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                    }`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{new Date(r.requestedAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <Button variant="primary" onClick={() => approve(r._id)} loading={loading[r._id]}>
                          Approve
                        </Button>
                        <Button variant="danger" onClick={() => reject(r._id)} loading={loading[r._id]}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
