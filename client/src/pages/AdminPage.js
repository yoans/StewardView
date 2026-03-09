import React, { useState, useEffect } from 'react';
import { authAPI, backupsAPI } from '../services/api';

const ROLES = ['admin', 'treasurer', 'elder', 'finance_committee', 'viewer'];
const ROLE_COLORS = {
  admin: 'bg-red-100 text-red-800',
  treasurer: 'bg-blue-100 text-blue-800',
  elder: 'bg-purple-100 text-purple-800',
  finance_committee: 'bg-yellow-100 text-yellow-800',
  viewer: 'bg-gray-100 text-gray-800',
};

export default function AdminPage({ user }) {
  const [users, setUsers] = useState([]);
  const [backups, setBackups] = useState([]);
  const [tab, setTab] = useState('users'); // 'users' | 'backups' | 'create'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New user form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('viewer');

  const loadUsers = async () => {
    try {
      const res = await authAPI.getUsers();
      setUsers(res.data);
    } catch (err) {
      setError('Failed to load users');
    }
  };

  const loadBackups = async () => {
    try {
      const res = await backupsAPI.list();
      setBackups(res.data);
    } catch { /* ignore if table doesn't exist yet */ }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadUsers(), loadBackups()]).finally(() => setLoading(false));
  }, []);

  const handleRoleChange = async (userId, newRole) => {
    setError(''); setSuccess('');
    try {
      await authAPI.updateUser(userId, { role: newRole });
      setSuccess('Role updated');
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleToggleActive = async (u) => {
    setError(''); setSuccess('');
    try {
      if (u.is_active) {
        await authAPI.deactivateUser(u.id);
        setSuccess('User deactivated');
      } else {
        await authAPI.updateUser(u.id, { is_active: true });
        setSuccess('User reactivated');
      }
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await authAPI.createUser({ email: newEmail, name: newName, password: newPassword, role: newRole });
      setSuccess('User created!');
      setNewEmail(''); setNewName(''); setNewPassword(''); setNewRole('viewer');
      loadUsers();
      setTab('users');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleCreateBackup = async () => {
    setError(''); setSuccess('');
    try {
      const res = await backupsAPI.create('manual');
      setSuccess(res.data.message);
      loadBackups();
    } catch (err) {
      setError(err.response?.data?.error || 'Backup failed');
    }
  };

  const handleDownloadBackup = async (id) => {
    try {
      const res = await backupsAPI.download(id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `stewardview-backup-${id}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download backup');
    }
  };

  const adminCount = users.filter(u => u.role === 'admin' && u.is_active).length;

  if (user.role !== 'admin') {
    return (
      <div className="card text-center py-12">
        <p className="text-red-600 text-lg font-medium">Access Denied</p>
        <p className="text-gray-500 mt-2">Only admins can access this page.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Administration</h2>
        <div className="flex gap-2">
          <button className={tab === 'users' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setTab('users')}>Users</button>
          <button className={tab === 'create' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setTab('create')}>Add User</button>
          <button className={tab === 'backups' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setTab('backups')}>Backups</button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm mb-4">{success}</div>}

      {/* Admin Count Warning */}
      <div className={`card mb-4 border ${adminCount >= 2 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{adminCount >= 2 ? '✅' : '⚠️'}</span>
          <span className={`text-sm font-medium ${adminCount >= 2 ? 'text-green-800' : 'text-red-800'}`}>
            {adminCount} active admin{adminCount !== 1 ? 's' : ''} — minimum 2 required
          </span>
        </div>
      </div>

      {loading ? <p className="text-center py-8 text-gray-500">Loading...</p> : (
        <>
          {/* Users Tab */}
          {tab === 'users' && (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2">Name</th>
                    <th className="pb-2">Email</th>
                    <th className="pb-2">Role</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className={`border-b hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                      <td className="py-3 font-medium text-gray-900">{u.name}</td>
                      <td className="py-3 text-gray-600">{u.email}</td>
                      <td className="py-3">
                        <select
                          className="input text-xs py-1 px-2 w-40"
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          disabled={u.id === user.id}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3">
                        {u.id !== user.id && (
                          <button
                            className={`text-xs ${u.is_active ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}
                            onClick={() => handleToggleActive(u)}
                          >
                            {u.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Create User Tab */}
          {tab === 'create' && (
            <div className="card max-w-lg">
              <h3 className="text-lg font-bold mb-4">Create New User</h3>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="label">Full Name</label>
                  <input type="text" className="input" value={newName} onChange={e => setNewName(e.target.value)} required />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input type="email" className="input" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input type="password" className="input" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} />
                </div>
                <div>
                  <label className="label">Role</label>
                  <select className="input" value={newRole} onChange={e => setNewRole(e.target.value)}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <button type="submit" className="btn-primary">Create User</button>
              </form>
            </div>
          )}

          {/* Backups Tab */}
          {tab === 'backups' && (
            <div>
              <div className="mb-4">
                <button className="btn-primary" onClick={handleCreateBackup}>Create Manual Backup Now</button>
                <p className="text-xs text-gray-500 mt-2">Automatic backups run daily at 2 AM. Manual backups can be created anytime.</p>
              </div>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2">ID</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Rows</th>
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.length === 0 ? (
                      <tr><td colSpan="6" className="py-4 text-center text-gray-400">No backups yet</td></tr>
                    ) : backups.map(b => (
                      <tr key={b.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 text-gray-600">{b.id}</td>
                        <td className="py-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${b.backup_type === 'scheduled' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                            {b.backup_type}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${b.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="py-2 text-gray-600">{b.row_count || 0}</td>
                        <td className="py-2 text-gray-600">{new Date(b.created_at).toLocaleString()}</td>
                        <td className="py-2">
                          {b.has_data && (
                            <button className="text-blue-600 hover:text-blue-800 text-xs mr-3" onClick={() => handleDownloadBackup(b.id)}>
                              Download
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
