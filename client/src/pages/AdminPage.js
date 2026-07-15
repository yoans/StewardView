import React, { useState, useEffect } from 'react';
import { authAPI, backupsAPI } from '../services/api';

const ROLES = ['admin', 'treasurer', 'viewer'];
const ROLE_COLORS = {
  admin: 'bg-red-100 text-red-800',
  treasurer: 'bg-blue-100 text-blue-800',
  elder: 'bg-purple-100 text-purple-800',
  finance_committee: 'bg-yellow-100 text-yellow-800',
  viewer: 'bg-gray-100 text-gray-800',
};

const emptyTenantProfile = {
  name: '',
  contact_email: '',
  phone: '',
  website: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'US',
  profile_image_url: '',
  logo_url: '',
  primary_color: '#1e3a8a',
  accent_color: '#c7a10e',
};

export default function AdminPage({ user, tenant, onTenantUpdated }) {
  const [users, setUsers] = useState([]);
  const [backups, setBackups] = useState([]);
  const [tenantProfile, setTenantProfile] = useState({ ...emptyTenantProfile });
  const [tab, setTab] = useState('users'); // 'users' | 'backups' | 'create'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New user form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
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

  const loadTenantProfile = async () => {
    try {
      const res = await authAPI.getTenant();
      setTenantProfile({ ...emptyTenantProfile, ...res.data });
    } catch (err) {
      setError('Failed to load organization profile');
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadUsers(), loadBackups(), loadTenantProfile()]).finally(() => setLoading(false));
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
        await authAPI.updateUser(u.id, { is_approved: true });
        setSuccess('User reactivated');
      }
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user');
    }
  };

  const handleResendInvite = async (userId) => {
    setError(''); setSuccess('');
    try {
      const res = await authAPI.resendInvite(userId);
      setSuccess(res.data.message || 'Setup link sent');
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send setup link');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await authAPI.createUser({ email: newEmail, name: newName, role: newRole });
      setSuccess('Invite sent. They can sign in after setting a password — no extra approval needed.');
      setNewEmail(''); setNewName(''); setNewRole('viewer');
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

  const handleTenantField = (field, value) => {
    setTenantProfile(current => ({ ...current, [field]: value }));
  };

  const handleSaveTenantProfile = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      const res = await authAPI.updateTenant(tenantProfile);
      setTenantProfile({ ...emptyTenantProfile, ...res.data });
      onTenantUpdated?.(res.data);
      setSuccess('Organization profile updated');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update organization profile');
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

  const userStatus = (u) => {
    if (u.must_set_password) return 'Invited — set password';
    if (!u.is_active) return 'Inactive';
    return 'Active';
  };

  const statusClasses = (status) => ({
    Active: 'bg-green-100 text-green-800',
    'Invited — set password': 'bg-blue-100 text-blue-800',
    Inactive: 'bg-red-100 text-red-800',
  }[status] || 'bg-gray-100 text-gray-700');

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
          <button className={tab === 'organization' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setTab('organization')}>Organization</button>
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
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusClasses(userStatus(u))}`}>
                          {userStatus(u)}
                        </span>
                      </td>
                      <td className="py-3 space-x-3">
                        {u.must_set_password && u.id !== user.id && (
                          <button className="text-xs text-blue-600 hover:text-blue-800" onClick={() => handleResendInvite(u.id)}>
                            Resend setup link
                          </button>
                        )}
                        {u.id !== user.id && u.is_approved && !u.must_set_password && (
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

          {/* Organization Tab */}
          {tab === 'organization' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <form onSubmit={handleSaveTenantProfile} className="card lg:col-span-2 space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Organization Profile</h3>
                  <p className="text-sm text-gray-500 mt-1">These details are shown to everyone in your organization.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="label">Organization Name</label>
                    <input type="text" className="input" value={tenantProfile.name} onChange={e => handleTenantField('name', e.target.value)} required />
                  </div>
                  <div>
                    <label className="label">Contact Email</label>
                    <input type="email" className="input" value={tenantProfile.contact_email || ''} onChange={e => handleTenantField('contact_email', e.target.value)} placeholder="office@example.org" />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input type="tel" className="input" value={tenantProfile.phone || ''} onChange={e => handleTenantField('phone', e.target.value)} placeholder="(555) 123-4567" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Website</label>
                    <input type="url" className="input" value={tenantProfile.website || ''} onChange={e => handleTenantField('website', e.target.value)} placeholder="https://example.org" />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Address</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="label">Street Address</label>
                      <input type="text" className="input" value={tenantProfile.address_line1 || ''} onChange={e => handleTenantField('address_line1', e.target.value)} placeholder="123 Main Street" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Address Line 2</label>
                      <input type="text" className="input" value={tenantProfile.address_line2 || ''} onChange={e => handleTenantField('address_line2', e.target.value)} placeholder="Suite, building, or campus" />
                    </div>
                    <div>
                      <label className="label">City</label>
                      <input type="text" className="input" value={tenantProfile.city || ''} onChange={e => handleTenantField('city', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">State</label>
                        <input type="text" className="input" value={tenantProfile.state || ''} onChange={e => handleTenantField('state', e.target.value)} />
                      </div>
                      <div>
                        <label className="label">ZIP</label>
                        <input type="text" className="input" value={tenantProfile.postal_code || ''} onChange={e => handleTenantField('postal_code', e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Images and Colors</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Profile Image URL</label>
                      <input type="url" className="input" value={tenantProfile.profile_image_url || ''} onChange={e => handleTenantField('profile_image_url', e.target.value)} placeholder="https://..." />
                    </div>
                    <div>
                      <label className="label">Logo URL</label>
                      <input type="url" className="input" value={tenantProfile.logo_url || ''} onChange={e => handleTenantField('logo_url', e.target.value)} placeholder="https://..." />
                    </div>
                    <div>
                      <label className="label">Primary Color</label>
                      <input type="color" className="input h-11 p-1" value={tenantProfile.primary_color || '#1e3a8a'} onChange={e => handleTenantField('primary_color', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Accent Color</label>
                      <input type="color" className="input h-11 p-1" value={tenantProfile.accent_color || '#c7a10e'} onChange={e => handleTenantField('accent_color', e.target.value)} />
                    </div>
                  </div>
                </div>

                <button type="submit" className="btn-primary">Save Organization Profile</button>
              </form>

              <div className="card h-fit">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Preview</p>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-14 w-14 rounded-lg bg-blue-50 border border-blue-100 overflow-hidden flex items-center justify-center text-blue-800 font-bold">
                    {tenantProfile.profile_image_url ? (
                      <img src={tenantProfile.profile_image_url} alt="Organization profile" className="h-full w-full object-cover" />
                    ) : tenantProfile.logo_url ? (
                      <img src={tenantProfile.logo_url} alt="Organization logo" className="h-full w-full object-contain p-1" />
                    ) : (
                      <span>{(tenantProfile.name || tenant?.name || 'SV').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{tenantProfile.name || tenant?.name}</p>
                    <p className="text-xs text-gray-500">{tenantProfile.contact_email || 'No contact email set'}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  {tenantProfile.phone && <p>{tenantProfile.phone}</p>}
                  {tenantProfile.website && <p>{tenantProfile.website}</p>}
                  {tenantProfile.address_line1 && <p>{tenantProfile.address_line1}</p>}
                  {tenantProfile.address_line2 && <p>{tenantProfile.address_line2}</p>}
                  {(tenantProfile.city || tenantProfile.state || tenantProfile.postal_code) && (
                    <p>{[tenantProfile.city, tenantProfile.state, tenantProfile.postal_code].filter(Boolean).join(', ')}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Create User Tab */}
          {tab === 'create' && (
            <div className="card max-w-lg">
              <h3 className="text-lg font-bold mb-2">Invite User</h3>
              <p className="text-sm text-gray-500 mb-4">The user will receive a temporary setup link by email and must be approved before signing in.</p>
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
                  <label className="label">Role</label>
                  <select className="input" value={newRole} onChange={e => setNewRole(e.target.value)}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <button type="submit" className="btn-primary">Send Setup Link</button>
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
