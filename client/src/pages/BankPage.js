import React, { useState, useEffect, useCallback, useRef } from 'react';
import { bankAPI } from '../services/api';
import FundsVsBankBanner from '../components/FundsVsBankBanner';

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

  const selectedAccount = accounts.find(a => String(a.id) === String(accountId));
  const canImport = accounts.length > 0 && accountId && file && !loading;

  return (
    <div className="card bg-white border border-gray-200">
      <div className="flex flex-col lg:flex-row lg:items-start gap-5">
        <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center text-2xl shrink-0">📥</div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 mb-1">Import Bank Transactions</h3>
          <p className="text-sm text-gray-600 mb-4">
            Upload a CSV export from online banking. StewardView imports cleared transactions, skips rows that already exist, and leaves categories and funds ready for review on the Transactions page.
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
          {accounts.length === 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800 mb-3">
              Add a bank account before importing transactions.
            </div>
          )}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)_auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Import Into</label>
              <select
                className="input-field text-sm"
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                disabled={accounts.length === 0}
                required
              >
                <option value="">Select account...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CSV File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="block w-full text-sm text-gray-700"
                onChange={e => setFile(e.target.files[0] || null)}
                disabled={accounts.length === 0}
                required
              />
              {file && <p className="text-xs text-gray-500 mt-1">Ready: {file.name}</p>}
            </div>
            <button type="submit" className="btn-primary text-sm whitespace-nowrap" disabled={!canImport}>
              {loading ? 'Importing...' : 'Import CSV'}
            </button>
          </form>
          {selectedAccount && <p className="text-xs text-gray-500 mt-3">Transactions will be attached to {selectedAccount.name}.</p>}
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
  const [opening, setOpening] = useState(
    initial?.opening_balance != null ? initial.opening_balance : (initial?.current_balance ?? '')
  );
  const [openingDate, setOpeningDate] = useState(
    initial?.opening_balance_date
      ? String(initial.opening_balance_date).slice(0, 10)
      : `${new Date().getFullYear()}-01-01`
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !institution.trim()) { setErr('Name and institution are required'); return; }
    setSaving(true);
    setErr('');
    try {
      const payload = {
        name,
        institution,
        account_mask: mask,
        opening_balance: parseFloat(opening) || 0,
        opening_balance_date: openingDate || null,
      };
      if (initial?.id) {
        await bankAPI.updateAccount(initial.id, payload);
      } else {
        await bankAPI.createAccount(payload);
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
          <label className="block text-xs font-medium text-gray-700 mb-1">Starting Balance</label>
          <input className="input-field" type="number" step="0.01" placeholder="0.00" value={opening} onChange={e => setOpening(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Starting Balance As Of</label>
          <input className="input-field" type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Set the starting balance for the year (or when you begin tracking). Book balance =
        starting balance + imported bank deposits − withdrawals. Givelify gifts update funds separately;
        cash appears on the bank CSV as a Givelify deposit.
      </p>
      {initial?.calculated_balance != null && (
        <p className="text-sm text-blue-800 bg-blue-50 rounded p-2">
          Calculated book balance: <strong>{fmt(initial.calculated_balance)}</strong>
        </p>
      )}
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
          <span className="text-gray-600">Book Balance (calculated)</span>
          <span className="font-bold text-blue-700">{fmt(acc.calculated_balance ?? acc.current_balance)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Starting balance</span>
          <span className="text-gray-700">{fmt(acc.opening_balance)}</span>
        </div>
        {acc.opening_balance_date && (
          <p className="text-xs text-gray-400">Starting as of {String(acc.opening_balance_date).slice(0, 10)}</p>
        )}
        <p className="text-xs text-gray-500 pt-1">
          Not a live bank feed — compare to your statement when reconciling.
        </p>
      </div>
      {canManage && (
        <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
          <button className="text-xs btn-secondary py-1 px-2" onClick={() => onEdit(acc)}>
            ✏️ Edit Starting Balance
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
            {t === 'import' && '📥 Import'}
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
                  <p className="text-sm text-blue-700">Total Book Balance — All Accounts</p>
                  <p className="text-3xl font-bold text-blue-800">{fmt(balances.total_balance)}</p>
                  <p className="text-xs text-blue-600 mt-1">
                    {accounts.length} account{accounts.length !== 1 ? 's' : ''} · calculated from starting balance + bank imports
                  </p>
                  {balances.note && (
                    <p className="text-xs text-blue-700 mt-2 max-w-xl">{balances.note}</p>
                  )}
                </div>
                <span className="text-4xl">🏦</span>
              </div>
            </div>
          )}

          <FundsVsBankBanner recon={balances?.funds_vs_bank} />

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
              <p className="text-sm mt-1">Add an account, then import transactions from your bank's CSV export.</p>
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
              onImported={() => { loadData(); setStatusMsg('Import finished. Review the imported transactions on the Transactions page.'); }}
            />
          ) : (
            <p className="text-gray-500 text-sm">Only admins and treasurers can import transactions.</p>
          )}
          <div className="card bg-gray-50 border border-gray-200">
            <h3 className="font-bold text-gray-800 mb-2">📄 Supported CSV Columns</h3>
            <p className="text-sm text-gray-600 mb-2">Column names are case-insensitive. Spaces become underscores, so "Posting Date" and "posting_date" both work.</p>
            <table className="text-sm w-full">
              <thead><tr className="text-left text-gray-500 border-b"><th className="pb-1 pr-4">Column</th><th className="pb-1 pr-4">Required</th><th className="pb-1">Notes</th></tr></thead>
              <tbody className="text-gray-700">
                <tr className="border-b"><td className="py-1 pr-4 font-mono">date</td><td className="pr-4">Yes</td><td>Also accepts posted_date, posting_date, transaction_date</td></tr>
                <tr className="border-b"><td className="py-1 pr-4 font-mono">amount</td><td className="pr-4">Yes*</td><td>Positive = income, negative = expense. Parentheses are treated as negative.</td></tr>
                <tr className="border-b"><td className="py-1 pr-4 font-mono">debit / credit</td><td className="pr-4">Yes*</td><td>Use instead of amount when your bank splits withdrawals and deposits</td></tr>
                <tr className="border-b"><td className="py-1 pr-4 font-mono">name / description</td><td className="pr-4">No</td><td>Prefer Name/payee; skips junk like &quot;Download from usbank.com&quot;</td></tr>
                <tr className="border-b"><td className="py-1 pr-4 font-mono">transaction</td><td className="pr-4">No</td><td>US Bank Credit/Debit column (sets income vs expense)</td></tr>
                <tr className="border-b"><td className="py-1 pr-4 font-mono">type</td><td className="pr-4">No</td><td>income or expense; inferred from amount when omitted</td></tr>
                <tr className="border-b"><td className="py-1 pr-4 font-mono">check_number</td><td className="pr-4">No</td><td>Check number if applicable</td></tr>
                <tr><td className="py-1 pr-4 font-mono">notes</td><td className="pr-4">No</td><td>Additional notes</td></tr>
              </tbody>
            </table>
            <p className="text-xs text-gray-500 mt-2">* Provide either amount or debit/credit columns.</p>
          </div>
        </div>
      )}

      {/* ── SETUP GUIDE TAB ── */}
      {tab === 'setup' && (
        <div className="space-y-4">
          <div className="card bg-indigo-50 border border-indigo-200">
            <h3 className="font-bold text-indigo-900 mb-3">🏦 Import Workflow</h3>
            <p className="text-sm text-indigo-800 mb-3">Use the same repeatable workflow each statement period:</p>
            <ol className="text-sm text-indigo-800 space-y-2 list-decimal list-inside">
              <li>Log in to your bank&apos;s website</li>
              <li>Navigate to your account&apos;s transaction history</li>
              <li>Set the date range you want to import</li>
              <li>Look for a <strong>Download</strong> or <strong>Export</strong> button and choose <strong>CSV</strong></li>
              <li>Upload the file here, then review imported transactions for categories and funds</li>
            </ol>
          </div>

          <div className="card bg-white border border-gray-200">
            <h3 className="font-bold text-gray-900 mb-3">US Bank — export then import</h3>
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside mb-3">
              <li>Sign in at <strong>usbank.com</strong> (or the US Bank mobile app → Account details on web)</li>
              <li>Open the checking (or savings) account you use for church funds</li>
              <li>Go to <strong>Account activity</strong> / transaction history</li>
              <li>Choose your date range (for example, last statement period)</li>
              <li>Select <strong>Download</strong> / <strong>Export</strong> and pick <strong>CSV</strong> (not PDF)</li>
              <li>In StewardView → Bank → Import, choose that US Bank account, then upload the CSV</li>
              <li>On Transactions, assign categories (and funds if needed) for new rows</li>
            </ol>
            <p className="text-sm text-gray-600 mb-2">
              US Bank CSVs usually include date, description, and amount (or withdrawal/deposit columns). StewardView accepts those names automatically.
            </p>
            <p className="text-xs text-gray-500">
              Tip: import soon after each statement closes so duplicates stay low. Rows that already match date + amount + description are skipped.
            </p>
          </div>

          <div className="card bg-gray-50 border border-gray-200">
            <h3 className="font-bold text-gray-800 mb-3">Starting balance &amp; reconciliation</h3>
            <p className="text-sm text-gray-700 mb-2">
              Book balance is calculated: starting balance + imported bank deposits − withdrawals.
              Set the starting balance (e.g. Jan 1) when you add or edit an account. Compare the calculated
              total to your bank statement — StewardView is not a live feed.
            </p>
            <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
              <li>Givelify gifts update <strong>funds / budget income</strong>, not bank cash</li>
              <li>When Givelify settles, the bank CSV shows a deposit — that row updates the bank balance (not funds again)</li>
              <li>Imported <strong>expenses</strong> draw from the <strong>General Fund</strong> by default so fund totals stay aligned with checking</li>
              <li>Leave bank Givelify deposits uncategorized (or use a non-budget category) so income is not double-counted</li>
              <li>Sum of all fund balances should equal the checking book balance — flagged on Dashboard, Bank, and Funds</li>
            </ul>
          </div>

          <div className="card bg-yellow-50 border border-yellow-200">
            <h3 className="font-bold text-yellow-900 mb-2">⚠️ Review Checklist</h3>
            <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
              <li>Duplicates with the same account, date, amount, type, description, and check number are skipped automatically.</li>
              <li>After import, review transactions on the <strong>Transactions</strong> page to assign categories and funds.</li>
              <li>Only <strong>Admin</strong> and <strong>Treasurer</strong> roles can import transactions.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
