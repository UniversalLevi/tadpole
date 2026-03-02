import { useState } from 'react';
import { api } from '../api/client';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';

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
    <Modal title="Deposit (testing)" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-4">
        Amount is added to your wallet directly. No payment gateway.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <Input
          label="Amount (INR)"
          type="number"
          step="0.01"
          min="1"
          placeholder="e.g. 100"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <div className="flex gap-3 pt-2">
          <Button type="submit" variant="primary" loading={loading}>
            Add amount
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
