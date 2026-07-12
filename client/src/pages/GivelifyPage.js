import React, { useState, useEffect, useRef } from 'react';
import { givelifyAPI, fundsAPI } from '../services/api';
import { formatDate } from '../utils/format';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function GivelifyPage({ user }) {
  const [contributions, setContributions] = useState([]);
  const [funds, setFunds] = useState([]);
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState('list'); // 'list' | 'import' | 'settings'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

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
        givelifyAPI.list({ limit: 500 }),
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

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ''));
      setError('');
      setSuccess('');
      setImportResult(null);
    };
    reader.onerror = () => setError('Could not read that file');
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCSVImport = async () => {
    setError(''); setSuccess(''); setImportResult(null);
    if (!csvText.trim()) { setError('Paste CSV text or choose a file first'); return; }

    setImporting(true);
    try {
      const res = await givelifyAPI.import(csvText);
      setImportResult(res.data);
      const pendingNote = res.data.pending ? `, ${res.data.pending} need manual earmark` : '';
      setSuccess(`Imported ${res.data.imported} contributions (${res.data.auto_earmarked} auto-earmarked${pendingNote})`);
      setCsvText('');
      loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleManualEarmark = async (contribId, fundId) => {
    setError(''); setSuccess('');
    try {
      await givelifyAPI.earmark(contribId, fundId);
      setSuccess('Contribution earmarked successfully — it will count toward budget actuals');
      loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Earmark failed');
    }
  };

  const handleSaveEnvelopeMap = async () => {
    setError(''); setSuccess('');
    try {
      const res = await givelifyAPI.updateEnvelopeMap(envelopeMap);
      setEnvelopeMap(res.data.map || envelopeMap);
      setSuccess('Envelope mapping saved');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save mapping');
    }
  };

  const addEnvelopeMapping = () => {
    if (newEnvelope && newFundName) {
      setEnvelopeMap({ ...envelopeMap, [newEnvelope.toLowerCase().trim()]: newFundName });
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
          <p className="text-gray-500 text-sm">Import giving CSV exports and auto-earmark to funds (feeds budget actuals)</p>
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
                      <td className="py-2 text-gray-600">{formatDate(c.date)}</td>
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
                Export the Donations report from Givelify (CSV), then upload the file or paste it below.
                Envelopes/campaigns are matched to your funds; matched gifts become income transactions
                under Tithes &amp; Offerings or Directed Contributions for budget vs actual.
              </p>
              <p className="text-xs text-gray-400 mb-3">
                Accepts common columns: donor name (or first/last), email, amount / gross amount, date,
                envelope / campaign / fund, donation ID. Quoted fields and commas in names are fine.
              </p>

              <div className="flex gap-2 mb-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button type="button" className="btn-secondary text-sm" onClick={() => fileInputRef.current?.click()}>
                  Choose CSV file
                </button>
              </div>

              <textarea
                className="input w-full h-48 font-mono text-xs"
                placeholder={'Donation ID,Donor Name,Email,Gross Amount,Date,Envelope\nGV-12345,John Smith,john@email.com,100.00,03/01/2026,Missions'}
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
              />
              <button className="btn-primary mt-3" onClick={handleCSVImport} disabled={!csvText.trim() || importing}>
                {importing ? 'Importing…' : 'Import Contributions'}
              </button>

              {importResult && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm space-y-1">
                  <p className="font-medium">Import Results:</p>
                  <p className="text-green-700">Imported: {importResult.imported}</p>
                  <p className="text-blue-700">Auto-earmarked: {importResult.auto_earmarked}</p>
                  {importResult.pending > 0 && (
                    <p className="text-yellow-700">Pending earmark: {importResult.pending}</p>
                  )}
                  <p className="text-gray-500">Skipped (duplicates): {importResult.skipped}</p>
                  {importResult.errors?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-red-600 font-medium">Errors: {importResult.errors.length}</p>
                      <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-red-700 space-y-1">
                        {importResult.errors.slice(0, 25).map((e, idx) => (
                          <li key={idx}>Row {e.row}: {e.error}</li>
                        ))}
                        {importResult.errors.length > 25 && (
                          <li>…and {importResult.errors.length - 25} more</li>
                        )}
                      </ul>
                    </div>
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
                Configure how Givelify envelope / campaign names map to your church funds.
                Matching is case-insensitive and allows partial matches (e.g. &quot;missions&quot; matches &quot;Missions - March&quot;).
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
                  <select className="input" value={newFundName} onChange={e => setNewFundName(e.target.value)}>
                    <option value="">Select fund…</option>
                    {funds.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                  </select>
                </div>
                <button className="btn-secondary" onClick={addEnvelopeMapping} disabled={!newEnvelope || !newFundName}>Add</button>
              </div>

              <button className="btn-primary" onClick={handleSaveEnvelopeMap}>Save Mapping</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
