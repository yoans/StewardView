import React, { useState, useEffect } from 'react';
import { bankAPI } from '../services/api';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function BankPage({ user }) {
  const [balances, setBalances] = useState(null);
  const [syncLog, setSyncLog] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const canSync = ['admin', 'treasurer'].includes(user.role);

  const loadData = async () => {
    try {
      const [balRes, logRes] = await Promise.all([
        bankAPI.balances(),
        bankAPI.syncLog(),
      ]);
      setBalances(balRes.data);
      setSyncLog(logRes.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadData(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await bankAPI.sync();
      await loadData();
      alert('Bank sync completed!');
    } catch (err) {
      alert(err.response?.data?.error || 'Bank sync failed. Make sure Plaid is configured.');
    }
    setSyncing(false);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Bank Accounts</h2>
        {canSync && (
          <button className="btn-primary" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing...' : '🔄 Sync with Bank of America'}
          </button>
        )}
      </div>

      {/* Balance Overview */}
      {balances && (
        <>
          <div className="card mb-6 bg-blue-50 border border-blue-200">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-blue-700">Total Balance (All Accounts)</p>
                <p className="text-3xl font-bold text-blue-800">{fmt(balances.total_balance)}</p>
              </div>
              <span className="text-4xl">🏦</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {balances.accounts.map(acc => (
              <div key={acc.id} className="card">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-gray-900">{acc.name}</h3>
                    <p className="text-sm text-gray-500">{acc.institution} {acc.account_mask ? `••••${acc.account_mask}` : ''}</p>
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
                    <p className="text-xs text-gray-400 pt-2">Last updated: {new Date(acc.balance_last_updated).toLocaleString()}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Plaid Setup Info */}
      <div className="card mb-6 bg-yellow-50 border border-yellow-200">
        <h3 className="font-bold text-yellow-800 mb-2">🔗 Bank of America Connection (Plaid)</h3>
        <p className="text-sm text-yellow-700 mb-3">
          This system connects to Bank of America through Plaid — the same secure service used by Venmo, Mint, and major financial apps.
        </p>
        <div className="text-sm text-yellow-700 space-y-1">
          <p>1. Sign up at <strong>plaid.com</strong> and get your API credentials</p>
          <p>2. Set <code>PLAID_CLIENT_ID</code> and <code>PLAID_SECRET</code> in <code>server/.env</code></p>
          <p>3. Use the Link button below to connect your Bank of America account</p>
          <p>4. Click "Sync" to pull latest balances and transactions</p>
        </div>
        {canSync && (
          <button className="btn-secondary mt-4 text-sm" onClick={async () => {
            try {
              const res = await bankAPI.linkToken();
              alert(`Link token created: ${res.data.link_token}\n\nIn production, this opens the Plaid Link UI to securely connect your bank.`);
            } catch (err) {
              alert(err.response?.data?.error || 'Plaid not configured yet. See setup instructions.');
            }
          }}>
            🔗 Link Bank of America Account
          </button>
        )}
      </div>

      {/* Sync History */}
      <div className="card">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Sync History</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Date</th>
              <th className="pb-2">Account</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Transactions Synced</th>
              <th className="pb-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {syncLog.map(entry => (
              <tr key={entry.id} className="border-b last:border-0">
                <td className="py-2 text-gray-600">{new Date(entry.synced_at).toLocaleString()}</td>
                <td className="py-2 text-gray-900">{entry.account_name || '—'}</td>
                <td className="py-2">
                  <span className={entry.status === 'success' ? 'badge-income' : 'badge-expense'}>{entry.status}</span>
                </td>
                <td className="py-2 text-gray-600">{entry.transactions_synced || 0}</td>
                <td className="py-2 text-red-500 text-xs">{entry.error_message || '—'}</td>
              </tr>
            ))}
            {syncLog.length === 0 && (
              <tr><td colSpan="5" className="py-4 text-center text-gray-400">No sync history yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
