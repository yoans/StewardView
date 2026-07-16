import React, { useState, useEffect } from 'react';
import { auditAPI } from '../services/api';

function summarizeValues(values) {
  if (!values || typeof values !== 'object') return null;
  const parts = [];
  const prefer = ['imported', 'skipped', 'auto_earmarked', 'pending', 'file', 'amount', 'type', 'description', 'year', 'month', 'email', 'name', 'role', 'budgeted_amount', 'from', 'to', 'count', 'action'];
  for (const key of prefer) {
    if (values[key] !== undefined && values[key] !== null && values[key] !== '') {
      parts.push(`${key}: ${typeof values[key] === 'object' ? JSON.stringify(values[key]) : values[key]}`);
    }
  }
  if (parts.length === 0) {
    return Object.entries(values).slice(0, 6).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
  }
  return parts.join(' · ');
}

export default function AuditPage() {
  const [entries, setEntries] = useState([]);
  const [filters, setFilters] = useState({ entity_type: '', start_date: '', end_date: '' });
  const [loading, setLoading] = useState(true);

  const loadAudit = async () => {
    setLoading(true);
    try {
      const res = await auditAPI.list({ ...filters, limit: 250 });
      setEntries(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { loadAudit(); }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Audit Trail</h2>

      <div className="card mb-4 bg-blue-50 border border-blue-200">
        <p className="text-sm text-blue-800">
          Imports, exports/downloads, transaction changes, budgets, funds, users, and reports are recorded here with who did it and what changed.
          This is an application change log — useful for accountability, not a cryptographic proof chain.
          Entries are not hash-linked; treat it as operational history, not an immutable evidence vault.
        </p>
      </div>

      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">Entity Type</label>
            <select className="input w-48" value={filters.entity_type} onChange={e => setFilters({...filters, entity_type: e.target.value})}>
              <option value="">All</option>
              <option value="transaction">Transactions</option>
              <option value="budget">Budget</option>
              <option value="fund">Funds</option>
              <option value="bank_account">Bank accounts</option>
              <option value="bank_import">Bank imports</option>
              <option value="givelify">Givelify</option>
              <option value="report">Reports</option>
              <option value="user">Users</option>
              <option value="settings">Settings</option>
              <option value="backup">Backups</option>
              <option value="tenant">Organization</option>
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={filters.start_date} onChange={e => setFilters({...filters, start_date: e.target.value})} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={filters.end_date} onChange={e => setFilters({...filters, end_date: e.target.value})} />
          </div>
          <button className="btn-primary" onClick={loadAudit}>Filter</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-center py-8 text-gray-500">Loading audit log...</p>
        ) : (
          <div className="space-y-3">
            {entries.map(entry => {
              const summary = summarizeValues(entry.new_values) || summarizeValues(entry.old_values);
              return (
              <div key={entry.id} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center space-x-3 min-w-0">
                    <ActionIcon action={entry.action} />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">
                        <span className="capitalize">{entry.action.replace(/_/g, ' ')}</span>
                        {' '}
                        <span className="text-blue-700">{entry.entity_type.replace(/_/g, ' ')}</span>
                        {entry.entity_id > 0 && <span className="text-gray-400"> #{entry.entity_id}</span>}
                      </p>
                      {summary && (
                        <p className="text-sm text-gray-700 mt-0.5 truncate" title={summary}>{summary}</p>
                      )}
                      <p className="text-sm text-gray-500">
                        by <strong>{entry.user_name || 'System'}</strong>
                        {entry.ip_address && <span className="text-gray-400"> from {entry.ip_address}</span>}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>

                {entry.change_reason && (
                  <p className="text-sm text-yellow-700 bg-yellow-50 rounded p-2 mt-2">
                    Reason: {entry.change_reason}
                  </p>
                )}

                {(entry.old_values || entry.new_values) && (
                  <details className="mt-3">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">Show full change details</summary>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {entry.old_values && (
                        <div className="bg-red-50 rounded p-3">
                          <p className="text-xs font-medium text-red-700 mb-1">Previous Values</p>
                          <pre className="text-xs text-red-800 overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(entry.old_values, null, 2)}
                          </pre>
                        </div>
                      )}
                      {entry.new_values && (
                        <div className="bg-green-50 rounded p-3">
                          <p className="text-xs font-medium text-green-700 mb-1">New Values</p>
                          <pre className="text-xs text-green-800 overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(entry.new_values, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
              );
            })}
            {entries.length === 0 && (
              <p className="text-center py-8 text-gray-400">No audit entries found</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionIcon({ action }) {
  const icons = {
    create: '➕',
    update: '✏️',
    delete: '🗑️',
    void: '🚫',
    login: '🔐',
    approve: '✅',
    transfer: '🔄',
    sync: '🔗',
    generate: '📄',
    download: '⬇️',
    import: '📥',
    invite: '✉️',
    invite_accepted: '✅',
    link: '🔗',
    seed: '🌱',
    copy: '📋',
    earmark: '🏷️',
  };

  return <span className="text-xl">{icons[action] || '📝'}</span>;
}
