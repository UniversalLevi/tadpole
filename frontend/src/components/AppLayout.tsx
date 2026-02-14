import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-layout">
      <nav className="top-nav">
        <Link to="/dashboard" className="brand">Tadpole</Link>
        <div className="nav-links">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/wallet">Wallet</Link>
          <Link to="/withdrawal">Withdraw</Link>
          {user?.role === 'admin' && <Link to="/admin">Admin</Link>}
          <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{user?.email}</span>
          <button type="button" onClick={handleLogout} className="btn-secondary">
            Logout
          </button>
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
