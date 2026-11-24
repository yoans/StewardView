import React, { useEffect, useState } from 'react';
import { bankAPI } from '../services/api';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function SimpleFinSync({ accounts, onChanged }) {
  const [connections, setConnections] = useState([]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [links, setLinks] = useState({});

  const load = async () => {
    try {
      const res = await bankAPI.connections();
      setConnections(res.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load bank connections');
    }
  };

  useEffect(() => { load(); }, []);

  const connect = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await bankAPI.connectSimplefin(token.trim());
      setToken('');
      setMessage('Connected. Choose which accounts to sync.');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not connect SimpleFIN');
    }
    setBusy(false);
  };

  const saveLinks = async (connection) => {
    const discovered = connection.discovered_accounts || [];
    const chosen = discovered
      .map((account) => ({ external_account_id: account.id, bank_account_id: links[account.id] }))
      .filter((link) => link.bank_account_id);
    if (!chosen.length) {
      setError('Choose a StewardView account for at least one bank account.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const payload = chosen.map((link) => (
        link.bank_account_id === 'new'
          ? { external_account_id: link.external_account_id }
          : { external_account_id: link.external_account_id, bank_account_id: Number(link.bank_account_id) }
      ));
      const res = await bankAPI.linkConnection(connection.id, payload);
      const imported = res.data?.sync?.imported || 0;
      setMessage(`Linked. Imported ${imported} new transaction${imported === 1 ? '' : 's'}.`);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not link accounts');
    }
    setBusy(false);
  };

  const syncNow = async (id) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await bankAPI.syncConnection(id);
      const imported = res.data?.imported || 0;
      const syncError = res.data?.errors?.[0];
      setMessage(syncError ? `Sync finished with a note: ${syncError}` : `Sync finished. ${imported} new transaction${imported === 1 ? '' : 's'}.`);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Sync failed');
    }
    setBusy(false);
  };

  const disconnect = async (id) => {
    if (!window.confirm('Disconnect this bank feed? Transactions already imported stay in the ledger.')) return;
    setBusy(true);
    setError('');
    try {
      await bankAPI.disconnectConnection(id);
      setMessage('Disconnected.');
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not disconnect');
    }
    setBusy(false);
  };

  return (
    <div className="card bg-white border border-gray-200">
      <h3 className="font-bold text-gray-900 mb-1">Automatic bank sync</h3>
      <p className="text-sm text-gray-600 mb-3">
        SimpleFIN Bridge pulls posted transactions about once a day. You connect the bank on SimpleFIN&apos;s site, then paste the one-time setup token here. StewardView never sees the bank password. CSV import still works.
      </p>
      <p className="text-sm mb-4">
        <a className="text-blue-700 underline" href="https://bridge.simplefin.org/simplefin/create" target="_blank" rel="noreferrer">
          Open SimpleFIN and create a setup token
        </a>
      </p>
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{error}</p>}
      {message && <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">{message}</p>}

      <form onSubmit={connect} className="flex flex-col md:flex-row gap-2 mb-4">
        <textarea
          className="input flex-1 min-h-[70px]"
          placeholder="Paste the SimpleFIN setup token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button type="submit" className="btn-primary text-sm self-start" disabled={busy || !token.trim()}>
          {busy ? 'Working...' : 'Connect'}
        </button>
      </form>

      {connections.map((connection) => {
        const linkedIds = new Set((connection.linked_accounts || []).map((account) => account.external_account_id));
        const unlinked = (connection.discovered_accounts || []).filter((account) => !linkedIds.has(account.id));
        return (
          <div key={connection.id} className="border-t border-gray-100 pt-3 mt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-gray-700">
                <p className="font-medium">SimpleFIN connection</p>
                <p className="text-xs text-gray-500">
                  {connection.last_sync_at ? `Last sync ${new Date(connection.last_sync_at).toLocaleString()}` : 'Not synced yet'}
                  {connection.last_sync_status ? ` · ${connection.last_sync_status}` : ''}
                </p>
                {connection.last_sync_error && <p className="text-xs text-red-700 mt-1">{connection.last_sync_error}</p>}
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={() => syncNow(connection.id)}>Sync now</button>
                <button type="button" className="text-xs text-red-600" disabled={busy} onClick={() => disconnect(connection.id)}>Disconnect</button>
              </div>
            </div>
            {(connection.linked_accounts || []).map((account) => (
              <p key={account.id} className="text-sm text-gray-700 mt-2">
                {account.name} syncs daily
                {account.reported_balance != null ? ` · bank reported ${fmt(account.reported_balance)}` : ''}
              </p>
            ))}
            {unlinked.length > 0 && (
              <div className="mt-3 space-y-2">
                {unlinked.map((account) => (
                  <div key={account.id} className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
                    <p className="text-sm text-gray-800">
                      {account.org ? `${account.org} · ` : ''}{account.name}
                      {account.balance != null ? ` (${fmt(account.balance)})` : ''}
                    </p>
                    <select
                      className="input"
                      value={links[account.id] || ''}
                      onChange={(e) => setLinks({ ...links, [account.id]: e.target.value })}
                    >
                      <option value="">Don&apos;t sync</option>
                      <option value="new">Create a new StewardView account</option>
                      {accounts.map((existing) => (
                        <option key={existing.id} value={existing.id}>{existing.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
                <button type="button" className="btn-primary text-sm" disabled={busy} onClick={() => saveLinks(connection)}>
                  Save and import
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
