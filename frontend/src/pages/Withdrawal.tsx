import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

type WithdrawalRow = { _id: string; amount: number; status: string; requestedAt: string };

export default function Withdrawal() {
  const [amount, setAmount] = useState('');
  const [list, setList] = useState<WithdrawalRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function load() {
    api.get<WithdrawalRow[]>('/withdrawal/requests').then((res) => setList(res.data)).catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(amount);
    if (!num || num < 100) {
      setError('Minimum withdrawal is 100 INR');
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
    <div className="page-card">
      <h1>Withdraw</h1>
      <Link to="/dashboard" className="back-link">← Back to Dashboard</Link>
      <form onSubmit={handleSubmit}>
        {error && <p className="error">{error}</p>}
        <input
          type="number"
          step="0.01"
          min="100"
          placeholder="Amount (INR, min 100)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button type="submit" disabled={loading} className="primary">
          {loading ? 'Submitting...' : 'Request withdrawal'}
        </button>
      </form>
      <h2>Your withdrawal requests</h2>
      <ul>
        {list.length === 0 && <li>No requests yet</li>}
        {list.map((r) => (
          <li key={r._id}>
            INR {r.amount} — {r.status} — {new Date(r.requestedAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
