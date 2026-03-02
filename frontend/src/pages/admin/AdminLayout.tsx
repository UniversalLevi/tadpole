import { Outlet, Link, useLocation } from 'react-router-dom';

const tabs = [
  { to: '/admin', label: 'Users' },
  { to: '/admin/withdrawals', label: 'Withdrawals' },
  { to: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="page-container flex h-14 items-center justify-between">
          <Link to="/admin" className="text-lg font-bold text-amber-700">
            Admin
          </Link>
          <nav className="flex gap-1">
            {tabs.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  location.pathname === to
                    ? 'bg-amber-100 text-amber-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <Link
            to="/dashboard"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Dashboard
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
