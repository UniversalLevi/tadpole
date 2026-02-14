import { useState } from 'react';
import { api } from '../api/client';

type Props = { onClose: () => void };

export default function DepositModal({ onClose }: Props) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(amount);
    if (Number.isNaN(num) || num < 1) {
      setError('Enter at least 1 INR');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/payment/test-deposit', { amount: Number(num) });
      onClose();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to add amount';
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Deposit (testing)</h3>
        <p className="modal-hint">Amount is added to your wallet directly. No payment gateway.</p>
        <form onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <input
            type="number"
            step="0.01"
            min="1"
            placeholder="Amount (INR)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="modal-actions">
            <button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add amount'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
