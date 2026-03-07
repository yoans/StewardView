import React, { useState, useEffect } from 'react';
import { auditAPI } from '../services/api';

export default function AuditPage() {
  const [entries, setEntries] = useState([]);
  const [filters, setFilters] = useState({ entity_type: '', start_date: '', end_date: '' });
  const [loading, setLoading] = useState(true);

  const loadAudit = async () => {
    setLoading(true);
    try {
      const res = await auditAPI.list(filters);
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
          <strong>Full Traceability:</strong> Every financial action is recorded here with who performed it, when, and what changed. 
          This log is append-only and cannot be modified or deleted.
        </p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">Entity Type</label>
            <select className="input w-40" value={filters.entity_type} onChange={e => setFilters({...filters, entity_type: e.target.value})}>
              <option value="">All</option>
              <option value="transaction">Transactions</option>
              <option value="budget">Budget</option>
              <option value="fund">Funds</option>
              <option value="bank_account">Bank</option>
              <option value="bank_sync">Bank Sync</option>
              <option value="user">Users</option>
              <option value="report">Reports</option>
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

      {/* Audit Log */}
      <div className="card">
        {loading ? (
          <p className="text-center py-8 text-gray-500">Loading audit log...</p>
        ) : (
          <div className="space-y-3">
            {entries.map(entry => (
              <div key={entry.id} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-3">
                    <ActionIcon action={entry.action} />
                    <div>
                      <p className="font-medium text-gray-900">
                        <span className="capitalize">{entry.action}</span>
                        {' '}
                        <span className="text-blue-700">{entry.entity_type}</span>
                        {entry.entity_id > 0 && <span className="text-gray-400"> #{entry.entity_id}</span>}
                      </p>
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
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
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
                )}
              </div>
            ))}
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
    link: '🔗',
    seed: '🌱',
    copy: '📋',
  };

  return <span className="text-xl">{icons[action] || '📝'}</span>;
}
