import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { Card } from '../../components/ui/Card';

type Settings = { bettingPaused: boolean; withdrawalsPaused: boolean; newRoundsPaused: boolean };

export default function AdminSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api.get<Settings>('/admin/settings').then((res) => setSettings(res.data)).catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(key: keyof Settings, value: boolean) {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await api.patch<Settings>('/admin/settings', { [key]: value });
      setSettings(res.data);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="page-container flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="text-2xl font-bold text-slate-900">Emergency &amp; Settings</h1>
      <p className="mt-1 text-slate-600">Pause betting, withdrawals, or new rounds. Use with care.</p>

      <Card title="System controls" className="mt-6 max-w-lg">
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
            <div>
              <p className="font-medium text-slate-900">Pause betting</p>
              <p className="text-sm text-slate-500">Users cannot place new bets</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.bettingPaused}
              disabled={saving}
              onClick={() => toggle('bettingPaused', !settings.bettingPaused)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 ${
                settings.bettingPaused ? 'bg-amber-500' : 'bg-slate-200'
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.bettingPaused ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
            <div>
              <p className="font-medium text-slate-900">Pause withdrawals</p>
              <p className="text-sm text-slate-500">Users cannot request withdrawals</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.withdrawalsPaused}
              disabled={saving}
              onClick={() => toggle('withdrawalsPaused', !settings.withdrawalsPaused)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 ${
                settings.withdrawalsPaused ? 'bg-amber-500' : 'bg-slate-200'
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.withdrawalsPaused ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
            <div>
              <p className="font-medium text-slate-900">Pause new rounds</p>
              <p className="text-sm text-slate-500">No new game rounds will start</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.newRoundsPaused}
              disabled={saving}
              onClick={() => toggle('newRoundsPaused', !settings.newRoundsPaused)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 ${
                settings.newRoundsPaused ? 'bg-amber-500' : 'bg-slate-200'
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.newRoundsPaused ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
        {(settings.bettingPaused || settings.withdrawalsPaused || settings.newRoundsPaused) && (
          <p className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            One or more controls are active. Remember to turn them off when done.
          </p>
        )}
      </Card>
    </div>
  );
}
