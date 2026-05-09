import React, { useState, useEffect, useCallback, useRef } from 'react';
import { bankAPI } from '../services/api';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// ── CSV Import Panel ────────────────────────────────────────────────────────
function CsvImportPanel({ accounts, onImported }) {
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!accountId) { setError('Select a bank account first'); return; }
    if (!file) { setError('Choose a CSV file to upload'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bank_account_id', accountId);
      const res = await bankAPI.importCsv(formData);
      setResult(res.data);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onImported();
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed');
    }
    setLoading(false);
  };

  return (
    <div className="card bg-indigo-50 border border-indigo-200">
      <div className="flex items-start gap-4">
        <span className="text-3xl">📥</span>
        <div className="flex-1">
          <h3 className="font-bold text-indigo-900 mb-1">Import Transactions from CSV</h3>
          <p className="text-sm text-indigo-700 mb-3">
            Download a CSV export from your bank's website, then upload it here. Required columns: <strong>date</strong>, <strong>amount</strong>, <strong>description</strong>.
            Optional: <em>type</em> (income/expense), <em>check_number</em>, <em>notes</em>.
          </p>
          {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800 mb-3">
              <strong>Import complete:</strong> {result.imported} imported, {result.skipped} skipped.
              {result.errors?.length > 0 && (
                <ul className="mt-1 list-disc list-inside text-xs text-red-700">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-indigo-800 mb-1">Bank Account</label>
              <select
                className="input-field text-sm"
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                required
              >
                <option value="">Select account…</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-indigo-800 mb-1">CSV File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="text-sm text-gray-700"
                onChange={e => setFile(e.target.files[0] || null)}
                required
              />
            </div>
            <button type="submit" className="btn-primary text-sm" disabled={loading}>
              {loading ? 'Importing…' : '⬆️ Import'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Manual Account Form ─────────────────────────────────────────────────────
function ManualAccountForm({ onSave, onCancel, initial }) {
  const [name, setName] = useState(initial?.name || '');
  const [institution, setInstitution] = useState(initial?.institution || '');
  const [mask, setMask] = useState(initial?.account_mask || '');
  const [balance, setBalance] = useState(initial?.current_balance || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !institution.trim()) { setErr('Name and institution are required'); return; }
    setSaving(true);
    setErr('');
    try {
      if (initial?.id) {
        await bankAPI.updateAccount(initial.id, { name, institution, account_mask: mask, current_balance: balance, available_balance: balance });
      } else {
        await bankAPI.createAccount({ name, institution, account_mask: mask, current_balance: parseFloat(balance) || 0, available_balance: parseFloat(balance) || 0 });
      }
      onSave();
    } catch (err) {
      setErr(err.response?.data?.error || 'Failed to save account');
    }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {err && <p className="text-red-600 text-sm">{err}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Account Name *</label>
          <input className="input-field" placeholder="e.g. Checking - General" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Bank / Institution *</label>
          <input className="input-field" placeholder="e.g. First National Bank" value={institution} onChange={e => setInstitution(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Last 4 Digits</label>
          <input className="input-field" placeholder="1234" maxLength={4} value={mask} onChange={e => setMask(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Current Balance</label>
          <input className="input-field" type="number" step="0.01" placeholder="0.00" value={balance} onChange={e => setBalance(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" className="btn-primary text-sm" disabled={saving}>{saving ? 'Saving...' : (initial?.id ? 'Save Changes' : 'Add Account')}</button>
        <button type="button" className="btn-secondary text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── Account Card ────────────────────────────────────────────────────────────
function AccountCard({ acc, canManage, onEdit, onDeactivate }) {
  return (
    <div className="card">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-bold text-gray-900">{acc.name}</h3>
          <p className="text-sm text-gray-500">
            {acc.institution}
            {acc.account_mask ? ` ••••${acc.account_mask}` : ''}
          </p>
        </div>
        <span className="text-2xl">🏧</span>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-600">Current Balance</span>
          <span className="font-bold text-blue-700">{fmt(acc.current_balance)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Available Balance</span>
          <span className="font-medium text-gray-900">{fmt(acc.available_balance)}</span>
        </div>
        {acc.balance_last_updated && (
          <p className="text-xs text-gray-400 pt-1">Last updated: {new Date(acc.balance_last_updated).toLocaleString()}</p>
        )}
      </div>
      {canManage && (
        <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
          <button className="text-xs btn-secondary py-1 px-2" onClick={() => onEdit(acc)}>
            ✏️ Edit Balance
          </button>
          <button className="text-xs text-red-600 hover:text-red-800 py-1 px-2" onClick={() => onDeactivate(acc.id)}>
            🗑 Remove
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Bank Page ──────────────────────────────────────────────────────────
export default function BankPage({ user }) {
  const [balances, setBalances] = useState(null);
  const [showAddManual, setShowAddManual] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [tab, setTab] = useState('accounts'); // 'accounts' | 'import' | 'setup'
  const [statusMsg, setStatusMsg] = useState('');
  const [statusError, setStatusError] = useState('');

  const canManage = ['admin', 'treasurer'].includes(user.role);

  const loadData = useCallback(async () => {
    try {
      const balRes = await bankAPI.balances();
      setBalances(balRes.data);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDeactivate = async (accountId) => {
    if (!window.confirm('Remove this bank account? This will not delete transaction history.')) return;
    try {
      await bankAPI.deactivateAccount(accountId);
      await loadData();
    } catch (err) {
      setStatusError(err.response?.data?.error || 'Failed to remove account');
    }
  };

  const accounts = balances?.accounts || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Bank Accounts</h2>
        {canManage && (
          <button className="btn-secondary text-sm" onClick={() => { setShowAddManual(true); setEditingAccount(null); }}>
            ➕ Add Account
          </button>
        )}
      </div>

      {statusMsg && (
        <div className="bg-green-50 text-green-700 border border-green-200 rounded-lg p-3 text-sm mb-4 flex justify-between">
          {statusMsg}
          <button className="text-green-500 hover:text-green-700" onClick={() => setStatusMsg('')}>✕</button>
        </div>
      )}
      {statusError && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm mb-4 flex justify-between">
          {statusError}
          <button className="text-red-500 hover:text-red-700" onClick={() => setStatusError('')}>✕</button>
        </div>
      )}

      {/* Tab Nav */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {['accounts', 'import', 'setup'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'accounts' && '🏦 Accounts'}
            {t === 'import' && '📥 Import CSV'}
            {t === 'setup' && '⚙️ Setup Guide'}
          </button>
        ))}
      </div>

      {/* ── ACCOUNTS TAB ── */}
      {tab === 'accounts' && (
        <>
          {/* Total Balance */}
          {balances && (
            <div className="card mb-6 bg-blue-50 border border-blue-200">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-blue-700">Total Balance — All Accounts</p>
                  <p className="text-3xl font-bold text-blue-800">{fmt(balances.total_balance)}</p>
                  <p className="text-xs text-blue-500 mt-1">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
                </div>
                <span className="text-4xl">🏦</span>
              </div>
            </div>
          )}

          {/* Add / Edit Form */}
          {canManage && (showAddManual || editingAccount) && (
            <div className="card mb-6 bg-gray-50 border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-3">{editingAccount ? '✏️ Edit Account' : '➕ Add Account'}</h3>
              <ManualAccountForm
                initial={editingAccount}
                onSave={() => { setShowAddManual(false); setEditingAccount(null); loadData(); }}
                onCancel={() => { setShowAddManual(false); setEditingAccount(null); }}
              />
            </div>
          )}

          {/* Account Grid */}
          {accounts.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">🏦</p>
              <p className="font-medium">No bank accounts yet</p>
              <p className="text-sm mt-1">Add an account above, then import transactions from the CSV tab</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accounts.map(acc => (
                <AccountCard
                  key={acc.id}
                  acc={acc}
                  canManage={canManage}
                  onEdit={setEditingAccount}
                  onDeactivate={handleDeactivate}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── IMPORT CSV TAB ── */}
      {tab === 'import' && (
        <div className="space-y-4">
          {canManage ? (
            <CsvImportPanel
              accounts={accounts}
              onImported={() => { loadData(); setStatusMsg('Transactions imported — check the Transactions page.'); }}
            />
          ) : (
            <p className="text-gray-500 text-sm">Only admins and treasurers can import transactions.</p>
          )}
          <div className="card bg-gray-50 border border-gray-200">
            <h3 className="font-bold text-gray-800 mb-2">📄 CSV Format</h3>
            <p className="text-sm text-gray-600 mb-2">Your CSV must have these column headers (spelling/case flexible):</p>
            <table className="text-sm w-full">
              <thead><tr className="text-left text-gray-500 border-b"><th className="pb-1 pr-4">Column</th><th className="pb-1 pr-4">Required</th><th className="pb-1">Notes</th></tr></thead>
              <tbody className="text-gray-700">
                <tr className="border-b"><td className="py-1 pr-4 font-mono">date</td><td className="pr-4">Yes</td><td>MM/DD/YYYY, YYYY-MM-DD, or MM-DD-YYYY</td></tr>
                <tr className="border-b"><td className="py-1 pr-4 font-mono">amount</td><td className="pr-4">Yes</td><td>Positive or negative number. Negative = expense.</td></tr>
                <tr className="border-b"><td className="py-1 pr-4 font-mono">description</td><td className="pr-4">No</td><td>Transaction description or memo</td></tr>
                <tr className="border-b"><td className="py-1 pr-4 font-mono">type</td><td className="pr-4">No</td><td>"income" or "expense" (inferred from sign if omitted)</td></tr>
                <tr className="border-b"><td className="py-1 pr-4 font-mono">check_number</td><td className="pr-4">No</td><td>Check number if applicable</td></tr>
                <tr><td className="py-1 pr-4 font-mono">notes</td><td className="pr-4">No</td><td>Additional notes</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SETUP GUIDE TAB ── */}
      {tab === 'setup' && (
        <div className="space-y-4">
          <div className="card bg-indigo-50 border border-indigo-200">
            <h3 className="font-bold text-indigo-900 mb-3">🏦 How to Get a CSV from Your Bank</h3>
            <p className="text-sm text-indigo-800 mb-3">Every major US bank lets you download transactions as CSV from your online banking portal:</p>
            <ol className="text-sm text-indigo-800 space-y-2 list-decimal list-inside">
              <li>Log in to your bank's website</li>
              <li>Navigate to your account's transaction history</li>
              <li>Set the date range you want to import</li>
              <li>Look for a <strong>"Download"</strong> or <strong>"Export"</strong> button — choose <strong>CSV</strong></li>
              <li>Come back here, select the account, and upload the file</li>
            </ol>
          </div>

          <div className="card bg-gray-50 border border-gray-200">
            <h3 className="font-bold text-gray-800 mb-3">🖊️ Manual Balance Updates</h3>
            <p className="text-sm text-gray-700 mb-2">
              You can also add accounts and update their balances manually without importing transactions.
              This is useful for accounts you reconcile monthly.
            </p>
            <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
              <li>Go to the <strong>Accounts</strong> tab and click <strong>"Add Account"</strong></li>
              <li>Click <strong>"Edit Balance"</strong> on any account to update it</li>
            </ul>
          </div>

          <div className="card bg-yellow-50 border border-yellow-200">
            <h3 className="font-bold text-yellow-900 mb-2">⚠️ Tips</h3>
            <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
              <li>Import is additive — duplicate transactions are not detected automatically. Avoid importing the same date range twice.</li>
              <li>After import, review transactions on the <strong>Transactions</strong> page to assign categories and funds.</li>
              <li>Only <strong>Admin</strong> and <strong>Treasurer</strong> roles can import transactions.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
