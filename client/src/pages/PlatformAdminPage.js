import React, { useState, useEffect, useCallback } from 'react';
import { platformAPI } from '../services/api';

const STATUS_COLORS = {
  active:    'bg-green-100 text-green-800',
  trial:     'bg-blue-100 text-blue-800',
  suspended: 'bg-yellow-100 text-yellow-800',
  canceled:  'bg-red-100 text-red-800',
};

function StatCard({ label, value, sub, color = 'indigo' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 shadow-sm`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold text-${color}-600 mt-1`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function PlatformAdminPage({ user, onLogout }) {
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [suspendReason, setSuspendReason] = useState('');
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, tenantsRes] = await Promise.all([
        platformAPI.stats(),
        platformAPI.tenants(),
      ]);
      setStats(statsRes.data);
      setTenants(tenantsRes.data);
    } catch (err) {
      setError('Failed to load data: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openTenant = async (id) => {
    try {
      const res = await platformAPI.getTenant(id);
      setSelected(res.data);
      setEditData({
        name: res.data.tenant.name,
        plan: res.data.tenant.plan,
        plan_amount: res.data.tenant.plan_amount,
        primary_color: res.data.tenant.primary_color || '#4f46e5',
        accent_color: res.data.tenant.accent_color || '#06b6d4',
        notes: res.data.tenant.notes || '',
      });
      setEditMode(false);
    } catch (err) {
      setError('Failed to load tenant: ' + (err.response?.data?.error || err.message));
    }
  };

  const saveEdit = async () => {
    setActionLoading(true);
    try {
      await platformAPI.updateTenant(selected.tenant.id, editData);
      await openTenant(selected.tenant.id);
      await loadData();
      setEditMode(false);
    } catch (err) {
      setError('Update failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const doSuspend = async () => {
    if (!suspendReason.trim()) return;
    setActionLoading(true);
    try {
      await platformAPI.suspend(selected.tenant.id, suspendReason);
      setShowSuspendModal(false);
      setSuspendReason('');
      await openTenant(selected.tenant.id);
      await loadData();
    } catch (err) {
      setError('Suspend failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const doReactivate = async () => {
    setActionLoading(true);
    try {
      await platformAPI.reactivate(selected.tenant.id);
      await openTenant(selected.tenant.id);
      await loadData();
    } catch (err) {
      setError('Reactivate failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const filteredTenants = tenants.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.admin_email?.toLowerCase().includes(search.toLowerCase()) ||
      t.slug?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-indigo-700 text-white px-6 py-4 flex items-center justify-between shadow-md">
        <div>
          <h1 className="text-xl font-bold">⚙️ Platform Admin</h1>
          <p className="text-indigo-200 text-sm">StewardView — Super Admin Portal</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-indigo-200">Signed in as {user?.name || user?.email}</span>
          <button onClick={onLogout}
            className="text-sm bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded transition">
            Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
            <StatCard label="Total Tenants" value={stats.total_tenants} color="indigo" />
            <StatCard label="Active" value={stats.active} color="green" />
            <StatCard label="Trial" value={stats.trial} color="blue" />
            <StatCard label="Suspended" value={stats.suspended} color="yellow" />
            <StatCard label="Free Plan" value={stats.free_plan} color="gray" />
            <StatCard label="Paid Plan" value={stats.paid_plan} color="purple" />
            <StatCard label="Est. MRR" value={`$${(stats.mrr || 0).toFixed(0)}`} sub={`${stats.total_users || 0} users`} color="emerald" />
          </div>
        )}

        <div className="flex gap-6">
          {/* Tenant list */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
                <input
                  type="search"
                  placeholder="Search by name, email, slug…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                  <option value="suspended">Suspended</option>
                  <option value="canceled">Canceled</option>
                </select>
                <button onClick={loadData}
                  className="text-sm bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition">
                  Refresh
                </button>
              </div>

              {loading ? (
                <div className="py-16 text-center text-gray-400">Loading tenants…</div>
              ) : filteredTenants.length === 0 ? (
                <div className="py-16 text-center text-gray-400">No tenants found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-3 font-medium">Church</th>
                        <th className="text-left px-4 py-3 font-medium">Admin Email</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">Plan</th>
                        <th className="text-left px-4 py-3 font-medium">MRR</th>
                        <th className="text-left px-4 py-3 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTenants.map(t => (
                        <tr key={t.id}
                          onClick={() => openTenant(t.id)}
                          className={`border-b border-gray-50 hover:bg-indigo-50 cursor-pointer transition ${selected?.tenant?.id === t.id ? 'bg-indigo-50' : ''}`}
                        >
                          <td className="px-4 py-3 font-medium text-gray-800">{t.name}</td>
                          <td className="px-4 py-3 text-gray-500">{t.admin_email}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}>
                              {t.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 capitalize text-gray-600">{t.plan || 'free'}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {t.plan_amount > 0 ? `$${parseFloat(t.plan_amount).toFixed(0)}/mo` : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">
                            {new Date(t.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Tenant detail panel */}
          {selected && (
            <div className="w-96 flex-shrink-0">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sticky top-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">{selected.tenant.name}</h2>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{selected.tenant.slug}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[selected.tenant.status] || 'bg-gray-100 text-gray-600'}`}>
                    {selected.tenant.status}
                  </span>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-gray-400">Users</p>
                    <p className="text-lg font-bold text-gray-700">{selected.stats?.users || 0}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-gray-400">Transactions</p>
                    <p className="text-lg font-bold text-gray-700">{selected.stats?.transactions || 0}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-gray-400">Accounts</p>
                    <p className="text-lg font-bold text-gray-700">{selected.stats?.bank_accounts || 0}</p>
                  </div>
                </div>

                {/* Edit form */}
                {editMode ? (
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Church Name</label>
                      <input type="text" value={editData.name}
                        onChange={e => setEditData(d => ({ ...d, name: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Plan</label>
                        <select value={editData.plan}
                          onChange={e => setEditData(d => ({ ...d, plan: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                          <option value="free">Free</option>
                          <option value="paid">Paid</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Monthly Amount ($)</label>
                        <input type="number" value={editData.plan_amount}
                          onChange={e => setEditData(d => ({ ...d, plan_amount: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Primary Color</label>
                        <input type="color" value={editData.primary_color}
                          onChange={e => setEditData(d => ({ ...d, primary_color: e.target.value }))}
                          className="w-full h-9 border border-gray-200 rounded-lg cursor-pointer" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Accent Color</label>
                        <input type="color" value={editData.accent_color}
                          onChange={e => setEditData(d => ({ ...d, accent_color: e.target.value }))}
                          className="w-full h-9 border border-gray-200 rounded-lg cursor-pointer" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Internal Notes</label>
                      <textarea value={editData.notes}
                        onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))}
                        rows={2}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveEdit} disabled={actionLoading}
                        className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition">
                        {actionLoading ? 'Saving…' : 'Save Changes'}
                      </button>
                      <button onClick={() => setEditMode(false)}
                        className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 mb-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Admin Email</span>
                      <span className="text-gray-800">{selected.tenant.admin_email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Plan</span>
                      <span className="text-gray-800 capitalize">{selected.tenant.plan || 'free'} {selected.tenant.plan_amount > 0 ? `· $${parseFloat(selected.tenant.plan_amount).toFixed(0)}/mo` : ''}</span>
                    </div>
                    {selected.tenant.stripe_subscription_id && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Stripe Sub</span>
                        <span className="font-mono text-xs text-gray-600">{selected.tenant.stripe_subscription_id.slice(0, 20)}…</span>
                      </div>
                    )}
                    {selected.tenant.notes && (
                      <div>
                        <span className="text-gray-500 block">Notes</span>
                        <span className="text-gray-700">{selected.tenant.notes}</span>
                      </div>
                    )}
                    <button onClick={() => setEditMode(true)}
                      className="w-full mt-2 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                      ✏️ Edit
                    </button>
                  </div>
                )}

                {/* Action buttons */}
                <div className="border-t border-gray-100 pt-4 flex flex-col gap-2">
                  {selected.tenant.status !== 'suspended' && selected.tenant.status !== 'canceled' ? (
                    <button
                      onClick={() => setShowSuspendModal(true)}
                      disabled={actionLoading}
                      className="w-full bg-yellow-50 text-yellow-700 border border-yellow-200 py-2 rounded-lg text-sm font-medium hover:bg-yellow-100 disabled:opacity-50 transition">
                      ⏸ Suspend Tenant
                    </button>
                  ) : (
                    <button
                      onClick={doReactivate}
                      disabled={actionLoading}
                      className="w-full bg-green-50 text-green-700 border border-green-200 py-2 rounded-lg text-sm font-medium hover:bg-green-100 disabled:opacity-50 transition">
                      {actionLoading ? 'Reactivating…' : '▶ Reactivate Tenant'}
                    </button>
                  )}
                  <button onClick={() => setSelected(null)}
                    className="w-full bg-gray-50 text-gray-500 py-1.5 rounded-lg text-xs hover:bg-gray-100 transition">
                    Close
                  </button>
                </div>

                {/* Users table */}
                {selected.users?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Users</p>
                    <div className="space-y-1">
                      {selected.users.map(u => (
                        <div key={u.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-700">{u.name || u.email}</span>
                          <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{u.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Suspend modal */}
      {showSuspendModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Suspend Tenant</h3>
            <p className="text-sm text-gray-500 mb-4">
              Suspending <strong>{selected?.tenant?.name}</strong> will block all user logins. Their data is preserved.
            </p>
            <label className="block text-sm text-gray-600 mb-1">Reason (required)</label>
            <textarea
              value={suspendReason}
              onChange={e => setSuspendReason(e.target.value)}
              placeholder="e.g. Non-payment, Terms violation…"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <div className="flex gap-3">
              <button onClick={doSuspend} disabled={!suspendReason.trim() || actionLoading}
                className="flex-1 bg-yellow-500 text-white py-2 rounded-lg font-medium hover:bg-yellow-600 disabled:opacity-50 transition">
                {actionLoading ? 'Suspending…' : 'Confirm Suspend'}
              </button>
              <button onClick={() => { setShowSuspendModal(false); setSuspendReason(''); }}
                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-200 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
