import React, { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { bankAPI } from '../services/api';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// ── Plaid Link Button ───────────────────────────────────────────────────────
function PlaidLinkButton({ onSuccess, onExit }) {
  const [linkToken, setLinkToken] = useState(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState('');

  const fetchToken = async () => {
    setTokenLoading(true);
    setTokenError('');
    try {
      const res = await bankAPI.linkToken();
      setLinkToken(res.data.link_token);
    } catch (err) {
      setTokenError(err.response?.data?.error || 'Could not start bank connection. Please contact support.');
    }
    setTokenLoading(false);
  };

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token, metadata) => {
      setLinkToken(null); // reset so token isn't reused
      onSuccess(public_token, metadata);
    },
    onExit: () => {
      setLinkToken(null);
      if (onExit) onExit();
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  return (
    <div>
      <button
        className="btn-primary"
        onClick={fetchToken}
        disabled={tokenLoading}
      >
        {tokenLoading ? 'Connecting...' : '🔗 Connect a Bank Account'}
      </button>
      {tokenError && <p className="text-red-600 text-xs mt-2">{tokenError}</p>}
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
function AccountCard({ acc, canManage, onEdit, onDeactivate, onSync, syncing }) {
  const isPlaid = !!acc.plaid_account_id;
  return (
    <div className="card">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-bold text-gray-900">{acc.name}</h3>
          <p className="text-sm text-gray-500">
            {acc.institution}
            {acc.account_mask ? ` ••••${acc.account_mask}` : ''}
            {isPlaid && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Plaid</span>}
            {!isPlaid && <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Manual</span>}
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
          {isPlaid && (
            <button className="text-xs btn-secondary py-1 px-2" onClick={() => onSync(acc.id)} disabled={syncing}>
              {syncing ? '...' : '🔄 Sync'}
            </button>
          )}
          {!isPlaid && (
            <button className="text-xs btn-secondary py-1 px-2" onClick={() => onEdit(acc)}>
              ✏️ Edit Balance
            </button>
          )}
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
  const [syncLog, setSyncLog] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [showAddManual, setShowAddManual] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [tab, setTab] = useState('accounts'); // 'accounts' | 'history' | 'setup'
  const [linkSuccess, setLinkSuccess] = useState('');
  const [linkError, setLinkError] = useState('');

  const canManage = ['admin', 'treasurer'].includes(user.role);

  const loadData = useCallback(async () => {
    try {
      const [balRes, logRes] = await Promise.all([
        bankAPI.balances(),
        bankAPI.syncLog(),
      ]);
      setBalances(balRes.data);
      setSyncLog(logRes.data);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Called after Plaid Link completes
  const handlePlaidSuccess = async (public_token, metadata) => {
    setLinkError('');
    try {
      const res = await bankAPI.exchangeToken({
        public_token,
        institution: metadata.institution,
        accounts: metadata.accounts,
      });
      setLinkSuccess(`✅ ${res.data.count} account(s) from ${metadata.institution.name} linked successfully!`);
      await loadData();
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Failed to link bank account');
    }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    setLinkError('');
    try {
      const res = await bankAPI.sync();
      const results = res.data.results || [];
      const ok = results.filter(r => !r.error).length;
      const fail = results.filter(r => r.error).length;
      setLinkSuccess(`Sync complete: ${ok} account(s) updated${fail ? `, ${fail} error(s)` : ''}`);
      await loadData();
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Sync failed');
    }
    setSyncing(false);
  };

  const handleSyncOne = async (accountId) => {
    setSyncingId(accountId);
    setLinkError('');
    try {
      await bankAPI.syncAccount(accountId);
      await loadData();
      setLinkSuccess('Account synced');
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Sync failed');
    }
    setSyncingId(null);
  };

  const handleDeactivate = async (accountId) => {
    if (!window.confirm('Remove this bank account? This will not delete transaction history.')) return;
    try {
      await bankAPI.deactivateAccount(accountId);
      await loadData();
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Failed to remove account');
    }
  };

  const accounts = balances?.accounts || [];
  const plaidAccounts = accounts.filter(a => a.plaid_account_id);
  const manualAccounts = accounts.filter(a => !a.plaid_account_id);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Bank Accounts</h2>
        <div className="flex gap-2 items-center">
          {canManage && plaidAccounts.length > 0 && (
            <button className="btn-secondary text-sm" onClick={handleSyncAll} disabled={syncing}>
              {syncing ? 'Syncing...' : '🔄 Sync All (Plaid)'}
            </button>
          )}
          {canManage && (
            <div className="flex gap-2">
              <button className="btn-secondary text-sm" onClick={() => { setShowAddManual(true); setEditingAccount(null); }}>
                ➕ Add Manually
              </button>
            </div>
          )}
        </div>
      </div>

      {linkSuccess && (
        <div className="bg-green-50 text-green-700 border border-green-200 rounded-lg p-3 text-sm mb-4 flex justify-between">
          {linkSuccess}
          <button className="text-green-500 hover:text-green-700" onClick={() => setLinkSuccess('')}>✕</button>
        </div>
      )}
      {linkError && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm mb-4 flex justify-between">
          {linkError}
          <button className="text-red-500 hover:text-red-700" onClick={() => setLinkError('')}>✕</button>
        </div>
      )}

      {/* Tab Nav */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {['accounts', 'history', 'setup'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'accounts' && '🏦 Accounts'}
            {t === 'history' && '📋 Sync History'}
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
                  <p className="text-xs text-blue-500 mt-1">{accounts.length} account{accounts.length !== 1 ? 's' : ''} ({plaidAccounts.length} via Plaid, {manualAccounts.length} manual)</p>
                </div>
                <span className="text-4xl">🏦</span>
              </div>
            </div>
          )}

          {/* Add Manual Form */}
          {canManage && (showAddManual || editingAccount) && (
            <div className="card mb-6 bg-gray-50 border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-3">{editingAccount ? '✏️ Edit Account' : '➕ Add Account Manually'}</h3>
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
              <p className="text-sm mt-1">Connect via Plaid or add manually above</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {accounts.map(acc => (
                <AccountCard
                  key={acc.id}
                  acc={acc}
                  canManage={canManage}
                  onEdit={setEditingAccount}
                  onDeactivate={handleDeactivate}
                  onSync={handleSyncOne}
                  syncing={syncingId === acc.id}
                />
              ))}
            </div>
          )}

          {/* Connect via Plaid */}
          {canManage && (
            <div className="card bg-indigo-50 border border-indigo-200">
              <div className="flex items-start gap-4">
                <span className="text-3xl">🔗</span>
                <div className="flex-1">
                  <h3 className="font-bold text-indigo-900 mb-1">Connect Any Bank via Plaid</h3>
                  <p className="text-sm text-indigo-700 mb-3">
                    Plaid supports 12,000+ financial institutions — any bank, credit union, or financial account your church uses.
                    Balances and transactions sync automatically.
                  </p>
                  <PlaidLinkButton onSuccess={handlePlaidSuccess} />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── SYNC HISTORY TAB ── */}
      {tab === 'history' && (
        <div className="card">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Plaid Sync History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Account</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Transactions Found</th>
                  <th className="pb-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {syncLog.map(entry => (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{new Date(entry.synced_at).toLocaleString()}</td>
                    <td className="py-2 pr-4 text-gray-900">{entry.account_name || '—'}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${entry.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-600">{entry.transactions_synced || 0}</td>
                    <td className="py-2 text-red-500 text-xs">{entry.error_message || '—'}</td>
                  </tr>
                ))}
                {syncLog.length === 0 && (
                  <tr><td colSpan="5" className="py-8 text-center text-gray-400">No sync history yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SETUP GUIDE TAB ── */}
      {tab === 'setup' && (
        <div className="space-y-4">
          <div className="card bg-blue-50 border border-blue-200">
            <h3 className="font-bold text-blue-900 mb-3">🔗 Plaid Setup (Automatic Bank Sync)</h3>
            <p className="text-sm text-blue-800 mb-4">
              Plaid is the industry-standard banking API used by Venmo, Robinhood, and thousands of financial apps.
              It supports <strong>12,000+ banks and credit unions</strong> — connect whatever bank(s) your church uses.
            </p>
            <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
              <li>Create a free account at <a href="https://plaid.com" target="_blank" rel="noreferrer" className="underline font-medium">plaid.com</a></li>
              <li>From the Plaid dashboard, get your <strong>Client ID</strong> and <strong>Secret</strong></li>
              <li>Open <code className="bg-blue-100 px-1 rounded">server/.env</code> and set:
                <pre className="mt-2 bg-blue-100 rounded p-3 text-xs overflow-auto">{`PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_secret_here
PLAID_ENV=sandbox   # change to 'production' when ready`}</pre>
              </li>
              <li>Restart the server, then return to the <strong>Accounts</strong> tab</li>
              <li>Click <strong>"Connect a Bank Account"</strong> — select any bank, log in securely</li>
              <li>Use <strong>"Sync All"</strong> to pull live balances at any time</li>
            </ol>
          </div>

          <div className="card bg-gray-50 border border-gray-200">
            <h3 className="font-bold text-gray-800 mb-3">🖊️ Manual Accounts (No Plaid Needed)</h3>
            <p className="text-sm text-gray-700 mb-2">
              If you prefer not to connect Plaid, you can add accounts manually and update balances yourself.
              This works for any bank, credit union, investment account, or cash fund.
            </p>
            <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
              <li>Go to the <strong>Accounts</strong> tab and click <strong>"Add Manually"</strong></li>
              <li>Enter the institution name, account nickname, and current balance</li>
              <li>Click <strong>"Edit Balance"</strong> on any manual account to update it over time</li>
            </ul>
          </div>

          <div className="card bg-yellow-50 border border-yellow-200">
            <h3 className="font-bold text-yellow-900 mb-2">⚠️ Security Notes</h3>
            <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
              <li>Plaid uses bank-grade encryption — your login credentials are never stored</li>
              <li>Use Plaid's <strong>sandbox</strong> environment for testing (uses fake credentials)</li>
              <li>In production, rotate your Plaid secret periodically</li>
              <li>Only <strong>Admin</strong> and <strong>Treasurer</strong> roles can add/remove accounts or trigger syncs</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
