import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="page-card">
      <h1>Dashboard</h1>
      <p className="welcome">Welcome, {user?.email}</p>
      <div className="nav-cards">
        <Link to="/wallet">Wallet</Link>
        <Link to="/withdrawal">Withdraw</Link>
        {user?.role === 'admin' && <Link to="/admin">Admin</Link>}
      </div>
    </div>
  );
}
