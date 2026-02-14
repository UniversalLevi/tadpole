import { Outlet, Link } from 'react-router-dom';

export default function AdminLayout() {
  return (
    <div className="app-layout">
      <nav className="top-nav">
        <Link to="/admin" className="brand">Admin</Link>
        <div className="nav-links">
          <Link to="/admin">Users</Link>
          <Link to="/admin/withdrawals">Withdrawals</Link>
          <Link to="/dashboard">Dashboard</Link>
        </div>
      </nav>
      <main style={{ maxWidth: '720px', width: '100%', margin: '0 auto', padding: '0 1rem' }}>
        <Outlet />
      </main>
    </div>
  );
}
