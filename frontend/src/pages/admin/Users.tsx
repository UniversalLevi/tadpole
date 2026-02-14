import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

type UserRow = { _id: string; email: string; role: string; isFrozen: boolean };

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);

  useEffect(() => {
    api.get<UserRow[]>('/admin/users').then((res) => setUsers(res.data)).catch(() => {});
  }, []);

  return (
    <div className="page-card">
      <h1>Users</h1>
      <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Frozen</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u._id}>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.isFrozen ? 'Yes' : 'No'}</td>
              <td><Link to={`/admin/users/${u._id}`}>View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
