const db = require('../models/db');
const { logAudit } = require('../models/auditLog');
const { decryptSecret, fetchAccounts, publicAccount } = require('./simplefin');
const { importClearedTransaction } = require('./bankImport');
const { addDays, isoDate, isoToUnixStart, todayInTimeZone, unixToIsoDate } = require('../utils/dates');
const { toCents, centsToDecimal } = require('../utils/money');

const STALE_MS = 20 * 60 * 60 * 1000;

function syncWindow(lastSyncAt, today) {
  const end = addDays(today, 1);
  const earliest = addDays(end, -90);
  if (!lastSyncAt) return { start: earliest, end };
  const lastDay = isoDate(lastSyncAt) || today;
  let start = addDays(lastDay, -5);
  if (start < earliest) start = earliest;
  return { start, end };
}

function recentlySynced(lastSyncAt) {
  if (!lastSyncAt) return false;
  const then = new Date(lastSyncAt).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then < STALE_MS;
}

function signedAmount(transaction) {
  const cents = toCents(transaction.amount);
  if (cents == null || cents === 0) return null;
  return {
    type: cents < 0 ? 'expense' : 'income',
    amount: centsToDecimal(Math.abs(cents)),
  };
}

async function importSimplefinAccount({
  tenantId,
  userId,
  bankAccount,
  simplefinAccount,
}) {
  let imported = 0;
  let duplicates = 0;
  const errors = [];
  const transactions = Array.isArray(simplefinAccount.transactions) ? simplefinAccount.transactions : [];

  for (const transaction of transactions) {
    if (transaction.pending) continue;
    const movement = signedAmount(transaction);
    const date = unixToIsoDate(transaction.posted);
    const externalId = transaction.id ? String(transaction.id) : '';
    if (!movement || !date || !externalId) {
      errors.push('Skipped a transaction with no date, amount, or id.');
      continue;
    }
    const description = String(transaction.description || transaction.payee || 'Bank transaction').slice(0, 255);
    const payee = transaction.payee ? String(transaction.payee).slice(0, 255) : null;
    const notes = transaction.memo ? String(transaction.memo).slice(0, 1000) : null;
    try {
      const outcome = await importClearedTransaction({
        tenantId,
        userId,
        account: bankAccount,
        date,
        description,
        payee,
        amount: movement.amount,
        type: movement.type,
        notes,
        externalId,
        source: 'simplefin',
      });
      if (outcome.status === 'imported') imported += 1;
      else duplicates += 1;
    } catch (err) {
      errors.push(err.message || 'Could not import a transaction.');
    }
  }

  if (simplefinAccount.balance != null) {
    const balanceDate = unixToIsoDate(simplefinAccount['balance-date'] || simplefinAccount.balance_date);
    await db('bank_accounts').where({ id: bankAccount.id, tenant_id: tenantId }).update({
      reported_balance: simplefinAccount.balance,
      reported_balance_at: balanceDate ? new Date(`${balanceDate}T12:00:00Z`) : new Date(),
    });
  }

  return { imported, duplicates, errors };
}

async function syncConnection(connection, { force = false, actor = null, today = null } = {}) {
  if (!force && recentlySynced(connection.last_sync_at)) {
    return { skipped: true, reason: 'synced recently' };
  }

  const asOf = today || todayInTimeZone();
  const window = syncWindow(connection.last_sync_at, asOf);
  let accessUrl;
  try {
    accessUrl = decryptSecret(connection.access_token_encrypted);
  } catch (err) {
    await db('bank_connections').where({ id: connection.id }).update({
      last_sync_status: 'error',
      last_sync_error: 'The saved SimpleFIN connection could not be read. Connect the bank again.',
    });
    return { skipped: false, imported: 0, duplicates: 0, errors: [err.message] };
  }

  let fetched;
  try {
    fetched = await fetchAccounts(accessUrl, {
      start: isoToUnixStart(window.start),
      end: isoToUnixStart(window.end),
    });
  } catch (err) {
    const message = err.name === 'TimeoutError' ? 'SimpleFIN did not respond.' : (err.message || 'SimpleFIN request failed.');
    await db('bank_connections').where({ id: connection.id }).update({
      last_sync_status: 'error',
      last_sync_error: message.slice(0, 2000),
      last_sync_at: new Date(),
    });
    return { skipped: false, imported: 0, duplicates: 0, errors: [message] };
  }

  const discovered = fetched.accounts.map(publicAccount).filter((account) => account.id);
  const linked = await db('bank_accounts')
    .where({ tenant_id: connection.tenant_id, connection_id: connection.id, is_active: true })
    .whereNotNull('external_account_id');

  let imported = 0;
  let duplicates = 0;
  const errors = [...fetched.errors];

  for (const account of linked) {
    const remote = fetched.accounts.find((item) => String(item.id) === String(account.external_account_id));
    if (!remote) {
      errors.push(`${account.name} was not in the SimpleFIN response.`);
      continue;
    }
    const outcome = await importSimplefinAccount({
      tenantId: connection.tenant_id,
      userId: actor?.userId || connection.created_by || null,
      bankAccount: account,
      simplefinAccount: remote,
    });
    imported += outcome.imported;
    duplicates += outcome.duplicates;
    errors.push(...outcome.errors.slice(0, 5));
  }

  const status = errors.length ? 'error' : 'ok';
  await db('bank_connections').where({ id: connection.id }).update({
    discovered_accounts: JSON.stringify(discovered),
    last_sync_at: new Date(),
    last_sync_status: status,
    last_sync_error: errors.length ? errors.slice(0, 8).join(' ').slice(0, 2000) : null,
  });

  if (imported || errors.length) {
    try {
      await logAudit({
        entityType: 'bank_connection',
        entityId: connection.id,
        action: 'sync',
        newValues: { imported, duplicates, error_count: errors.length, window },
        userId: actor?.userId || null,
        userName: actor?.userName || 'Scheduled job',
        ipAddress: actor?.ipAddress || null,
        tenantId: connection.tenant_id,
      });
    } catch (err) {
      console.error('Bank sync audit failed:', err.message);
    }
  }

  return { skipped: false, imported, duplicates, errors, discovered };
}

async function syncBankConnections({ force = false, tenantId = null, actor = null } = {}) {
  const hasTable = await db.schema.hasTable('bank_connections');
  if (!hasTable) return [];
  let query = db('bank_connections');
  if (tenantId) query = query.where({ tenant_id: tenantId });
  const connections = await query;
  const results = [];
  for (const connection of connections) {
    try {
      const outcome = await syncConnection(connection, { force, actor });
      results.push({ id: connection.id, ...outcome });
      if (!outcome.skipped) {
        console.log(`Bank connection ${connection.id}: imported ${outcome.imported || 0}, duplicates ${outcome.duplicates || 0}`);
      }
    } catch (err) {
      console.error(`Bank connection ${connection.id} failed:`, err.message);
      results.push({ id: connection.id, errors: [err.message] });
    }
  }
  return results;
}

module.exports = {
  syncWindow,
  recentlySynced,
  signedAmount,
  syncConnection,
  syncBankConnections,
};
