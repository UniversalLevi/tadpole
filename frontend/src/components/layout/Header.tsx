import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

export function Header() {
  const { user, logout } = useAuth();
  const { walletBalance, connected } = useSocket();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  async function handleLogout() {
    await logout();
    setUserMenuOpen(false);
    setMenuOpen(false);
    navigate('/login');
  }

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/wallet', label: 'Wallet' },
    { to: '/game', label: 'Game' },
    { to: '/withdrawal', label: 'Withdraw' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="page-container flex h-14 items-center justify-between gap-4 sm:h-16">
        <Link to="/dashboard" className="text-xl font-bold text-teal-600 hover:text-teal-700">
          Tadpole
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {label}
            </Link>
          ))}
          {user?.role === 'admin' && (
            <Link
              to="/admin"
              className="rounded-lg px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 hover:text-amber-800"
            >
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {walletBalance != null && (
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-900 tabular-nums">
                ₹{walletBalance.available.toFixed(2)}
              </p>
              <p className="text-xs text-slate-500">Balance</p>
            </div>
          )}
          {connected !== undefined && (
            <span
              className={`hidden rounded-full px-2 py-0.5 text-xs font-medium sm:inline-block ${
                connected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {connected ? 'Live' : 'Connecting…'}
            </span>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <span className="max-w-[120px] truncate">{user?.email}</span>
              <span className="text-slate-400">▾</span>
            </button>
            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <p className="truncate px-3 py-2 text-xs text-slate-500">{user?.email}</p>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="text-xl">{menuOpen ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {navLinks.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {label}
              </Link>
            ))}
            {user?.role === 'admin' && (
              <Link
                to="/admin"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
              >
                Admin
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
