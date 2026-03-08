import React, { useState, useEffect } from 'react';
import { givelifyAPI, fundsAPI } from '../services/api';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function GivelifyPage({ user }) {
  const [contributions, setContributions] = useState([]);
  const [funds, setFunds] = useState([]);
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState('list'); // 'list' | 'import' | 'settings'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Import form
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState(null);

  // Envelope mapping
  const [envelopeMap, setEnvelopeMap] = useState({});
  const [newEnvelope, setNewEnvelope] = useState('');
  const [newFundName, setNewFundName] = useState('');

  const canEdit = ['admin', 'treasurer'].includes(user?.role);

  const loadData = async () => {
    setLoading(true);
    try {
      const [contribRes, fundsRes, summRes] = await Promise.all([
        givelifyAPI.list({}),
        fundsAPI.list(),
        givelifyAPI.summary(),
      ]);
      setContributions(contribRes.data);
      setFunds(fundsRes.data);
      setSummary(summRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const loadEnvelopeMap = async () => {
    try {
      const res = await givelifyAPI.getEnvelopeMap();
      setEnvelopeMap(res.data);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadData(); loadEnvelopeMap(); }, []);

  const handleCSVImport = async () => {
    setError(''); setSuccess(''); setImportResult(null);
    try {
      // Parse simple CSV: donor_name, amount, date, envelope, givelify_id
      const lines = csvText.trim().split('\n');
      if (lines.length < 2) { setError('CSV must have a header row and at least one data row'); return; }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
      const contributions = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row = {};
        headers.forEach((h, idx) => {
          if (h.includes('donor') && h.includes('name')) row.donor_name = values[idx];
          else if (h.includes('email')) row.donor_email = values[idx];
          else if (h.includes('amount') || h.includes('total')) row.amount = values[idx]?.replace(/[$,]/g, '');
          else if (h.includes('date')) row.date = values[idx];
          else if (h.includes('envelope') || h.includes('fund') || h.includes('category')) row.envelope = values[idx];
          else if (h.includes('id') || h.includes('transaction')) row.givelify_id = values[idx];
        });
        if (row.amount && row.date) contributions.push(row);
      }

      if (contributions.length === 0) { setError('No valid rows found'); return; }

      const res = await givelifyAPI.import(contributions);
      setImportResult(res.data);
      setSuccess(`Imported ${res.data.imported} contributions (${res.data.auto_earmarked} auto-earmarked)`);
      loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed');
    }
  };

  const handleManualEarmark = async (contribId, fundId) => {
    setError(''); setSuccess('');
    try {
      await givelifyAPI.earmark(contribId, fundId);
      setSuccess('Contribution earmarked successfully');
      loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Earmark failed');
    }
  };

  const handleSaveEnvelopeMap = async () => {
    setError(''); setSuccess('');
    try {
      await givelifyAPI.updateEnvelopeMap(envelopeMap);
      setSuccess('Envelope mapping saved');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save mapping');
    }
  };

  const addEnvelopeMapping = () => {
    if (newEnvelope && newFundName) {
      setEnvelopeMap({ ...envelopeMap, [newEnvelope.toLowerCase()]: newFundName });
      setNewEnvelope('');
      setNewFundName('');
    }
  };

  const removeEnvelopeMapping = (key) => {
    const updated = { ...envelopeMap };
    delete updated[key];
    setEnvelopeMap(updated);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Givelify Contributions</h2>
          <p className="text-gray-500 text-sm">Import and manage Givelify giving data with auto-earmarking</p>
        </div>
        <div className="flex gap-2">
          <button className={tab === 'list' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setTab('list')}>Contributions</button>
          {canEdit && <button className={tab === 'import' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setTab('import')}>Import CSV</button>}
          {canEdit && <button className={tab === 'settings' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setTab('settings')}>Mapping</button>}
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm mb-4">{success}</div>}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="card bg-green-50 border border-green-200">
            <p className="text-sm text-green-700">All-Time Givelify</p>
            <p className="text-xl font-bold text-green-700">{fmt(summary.total_all_time)}</p>
          </div>
          <div className="card bg-blue-50 border border-blue-200">
            <p className="text-sm text-blue-700">This Month</p>
            <p className="text-xl font-bold text-blue-700">{fmt(summary.total_this_month)}</p>
          </div>
          <div className="card bg-yellow-50 border border-yellow-200">
            <p className="text-sm text-yellow-700">Pending Earmark</p>
            <p className="text-xl font-bold text-yellow-700">{summary.pending_count}</p>
          </div>
        </div>
      )}

      {loading ? <p className="text-center py-8 text-gray-500">Loading...</p> : (
        <>
          {/* List Tab */}
          {tab === 'list' && (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Donor</th>
                    <th className="pb-2">Envelope</th>
                    <th className="pb-2 text-right">Amount</th>
                    <th className="pb-2">Fund</th>
                    <th className="pb-2">Status</th>
                    {canEdit && <th className="pb-2">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {contributions.length === 0 ? (
                    <tr><td colSpan="7" className="py-8 text-center text-gray-400">No Givelify contributions imported yet. Use "Import CSV" to get started.</td></tr>
                  ) : contributions.map(c => (
                    <tr key={c.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 text-gray-600">{c.date}</td>
                      <td className="py-2 font-medium text-gray-900">{c.donor_name}</td>
                      <td className="py-2 text-gray-600">{c.envelope}</td>
                      <td className="py-2 text-right font-medium text-green-700">{fmt(c.amount)}</td>
                      <td className="py-2 text-gray-600">{c.fund_name || c.fund_mapping || '—'}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          c.status === 'imported' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>{c.status}</span>
                      </td>
                      {canEdit && (
                        <td className="py-2">
                          {c.status === 'pending' && (
                            <select
                              className="input text-xs py-1 px-2"
                              defaultValue=""
                              onChange={(e) => { if (e.target.value) handleManualEarmark(c.id, parseInt(e.target.value)); }}
                            >
                              <option value="">Earmark to...</option>
                              {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Import Tab */}
          {tab === 'import' && canEdit && (
            <div className="card max-w-3xl">
              <h3 className="text-lg font-bold mb-2">Import from Givelify CSV</h3>
              <p className="text-sm text-gray-500 mb-4">
                Export your giving data from Givelify's dashboard as CSV, then paste it below.
                The system will auto-match envelopes to your earmarked funds.
              </p>
              <p className="text-xs text-gray-400 mb-2">
                Expected columns: donor_name, email, amount, date, envelope/category, transaction_id
              </p>
              <textarea
                className="input w-full h-48 font-mono text-xs"
                placeholder={'donor_name,email,amount,date,envelope,transaction_id\nJohn Smith,john@email.com,100.00,2026-03-01,Missions,GV-12345'}
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
              />
              <button className="btn-primary mt-3" onClick={handleCSVImport} disabled={!csvText.trim()}>
                Import Contributions
              </button>

              {importResult && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm">
                  <p className="font-medium">Import Results:</p>
                  <p className="text-green-700">Imported: {importResult.imported}</p>
                  <p className="text-blue-700">Auto-earmarked: {importResult.auto_earmarked}</p>
                  <p className="text-gray-500">Skipped (duplicates): {importResult.skipped}</p>
                  {importResult.errors?.length > 0 && (
                    <p className="text-red-600">Errors: {importResult.errors.length}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {tab === 'settings' && canEdit && (
            <div className="card max-w-2xl">
              <h3 className="text-lg font-bold mb-2">Envelope → Fund Mapping</h3>
              <p className="text-sm text-gray-500 mb-4">
                Configure how Givelify envelope names automatically map to your church funds.
              </p>

              <div className="space-y-2 mb-4">
                {Object.entries(envelopeMap).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                    <span className="text-sm font-mono text-gray-700 flex-1">"{key}"</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-sm font-medium text-blue-700 flex-1">{val}</span>
                    <button className="text-red-500 hover:text-red-700 text-xs" onClick={() => removeEnvelopeMapping(key)}>Remove</button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 items-end mb-4">
                <div className="flex-1">
                  <label className="label">Envelope Name</label>
                  <input type="text" className="input" placeholder="e.g. missions" value={newEnvelope} onChange={e => setNewEnvelope(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="label">Maps to Fund</label>
                  <input type="text" className="input" placeholder="e.g. Missions Fund" value={newFundName} onChange={e => setNewFundName(e.target.value)} />
                </div>
                <button className="btn-secondary" onClick={addEnvelopeMapping}>Add</button>
              </div>

              <button className="btn-primary" onClick={handleSaveEnvelopeMap}>Save Mapping</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
