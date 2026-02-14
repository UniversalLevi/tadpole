import { useState, useEffect } from 'react';
import { api } from '../../api/client';

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

  return (
    <div className="page-card">
      <h1>Withdrawal requests</h1>
      <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Requested</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r._id}>
              <td>{typeof r.userId === 'object' && r.userId && 'email' in r.userId ? r.userId.email : String(r.userId)}</td>
              <td>INR {r.amount}</td>
              <td>{r.status}</td>
              <td>{new Date(r.requestedAt).toLocaleString()}</td>
              <td>
                {r.status === 'pending' && (
                  <>
                    <button onClick={() => approve(r._id)} disabled={loading[r._id]}>Approve</button>
                    <button onClick={() => reject(r._id)} disabled={loading[r._id]}>Reject</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
