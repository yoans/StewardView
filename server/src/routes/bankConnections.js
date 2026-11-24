const router = require('express').Router();
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logAudit } = require('../models/auditLog');
const { claimSetupToken, encryptSecret, fetchAccounts, publicAccount } = require('../services/simplefin');
const { syncConnection } = require('../services/bankSync');
const { todayInTimeZone, addDays, isoToUnixStart } = require('../utils/dates');

function presentConnection(connection, links) {
  let discovered = [];
  try {
    discovered = JSON.parse(connection.discovered_accounts || '[]');
  } catch {
    discovered = [];
  }
  return {
    id: connection.id,
    provider: connection.provider,
    last_sync_at: connection.last_sync_at,
    last_sync_status: connection.last_sync_status,
    last_sync_error: connection.last_sync_error,
    discovered_accounts: discovered,
    linked_accounts: links || [],
  };
}

async function loadConnection(id, tenantId) {
  return db('bank_connections').where({ id, tenant_id: tenantId }).first();
}

router.get('/', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const connections = await db('bank_connections').where({ tenant_id: req.tenantId }).orderBy('id');
    const links = await db('bank_accounts')
      .where({ tenant_id: req.tenantId, is_active: true })
      .whereNotNull('connection_id')
      .select('id', 'name', 'connection_id', 'external_account_id', 'reported_balance', 'reported_balance_at');
    res.json(connections.map((connection) => presentConnection(
      connection,
      links.filter((link) => link.connection_id === connection.id),
    )));
  } catch (err) {
    console.error('List bank connections error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/simplefin', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const setupToken = req.body.setup_token;
    const accessUrl = await claimSetupToken(setupToken);
    const today = todayInTimeZone();
    const fetched = await fetchAccounts(accessUrl, {
      start: isoToUnixStart(today),
      end: isoToUnixStart(addDays(today, 1)),
    });
    const discovered = fetched.accounts.map(publicAccount).filter((account) => account.id);
    if (!discovered.length && fetched.errors.length) {
      return res.status(400).json({ error: fetched.errors[0] });
    }

    const [{ id }] = await db('bank_connections').insert({
      tenant_id: req.tenantId,
      provider: 'simplefin',
      access_token_encrypted: encryptSecret(accessUrl),
      discovered_accounts: JSON.stringify(discovered),
      created_by: req.user.id,
    }).returning('id');

    await logAudit({
      entityType: 'bank_connection',
      entityId: id,
      action: 'create',
      newValues: { provider: 'simplefin', accounts: discovered.length },
      userId: req.user.id,
      userName: req.user.name,
      ipAddress: req.ip,
      tenantId: req.tenantId,
    });

    const created = await loadConnection(id, req.tenantId);
    res.status(201).json(presentConnection(created, []));
  } catch (err) {
    console.error('SimpleFIN connect error:', err.message);
    res.status(400).json({ error: err.message || 'Could not connect SimpleFIN' });
  }
});

router.post('/:id/link', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const connection = await loadConnection(req.params.id, req.tenantId);
    if (!connection) return res.status(404).json({ error: 'Connection not found' });

    const links = Array.isArray(req.body.links) ? req.body.links : [];
    if (!links.length) return res.status(400).json({ error: 'Choose at least one account to sync' });

    let discovered = [];
    try {
      discovered = JSON.parse(connection.discovered_accounts || '[]');
    } catch {
      discovered = [];
    }

    for (const link of links) {
      const remote = discovered.find((account) => account.id === String(link.external_account_id));
      if (!remote) return res.status(400).json({ error: 'That bank account is not on this connection' });

      if (link.bank_account_id) {
        const account = await db('bank_accounts')
          .where({ id: link.bank_account_id, tenant_id: req.tenantId, is_active: true })
          .first();
        if (!account) return res.status(404).json({ error: 'Bank account not found' });
        await db('bank_accounts').where({ id: account.id }).update({
          connection_id: connection.id,
          external_account_id: remote.id,
        });
      } else {
        const today = todayInTimeZone();
        await db('bank_accounts').insert({
          name: remote.name || 'Bank account',
          institution: remote.org || 'Bank',
          account_type: 'checking',
          opening_balance: 0,
          opening_balance_date: today,
          current_balance: 0,
          available_balance: 0,
          connection_id: connection.id,
          external_account_id: remote.id,
          tenant_id: req.tenantId,
          balance_last_updated: new Date().toISOString(),
        });
      }
    }

    const summary = await syncConnection(connection, {
      force: true,
      actor: { userId: req.user.id, userName: req.user.name, ipAddress: req.ip },
    });
    const fresh = await loadConnection(connection.id, req.tenantId);
    const linked = await db('bank_accounts')
      .where({ tenant_id: req.tenantId, connection_id: connection.id, is_active: true })
      .select('id', 'name', 'connection_id', 'external_account_id', 'reported_balance', 'reported_balance_at');

    res.json({ connection: presentConnection(fresh, linked), sync: summary });
  } catch (err) {
    console.error('Link bank connection error:', err);
    res.status(500).json({ error: err.message || 'Could not link accounts' });
  }
});

router.post('/:id/sync', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const connection = await loadConnection(req.params.id, req.tenantId);
    if (!connection) return res.status(404).json({ error: 'Connection not found' });
    const summary = await syncConnection(connection, {
      force: true,
      actor: { userId: req.user.id, userName: req.user.name, ipAddress: req.ip },
    });
    const fresh = await loadConnection(connection.id, req.tenantId);
    res.json({ ...summary, connection: presentConnection(fresh) });
  } catch (err) {
    console.error('Sync bank connection error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

router.delete('/:id', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const connection = await loadConnection(req.params.id, req.tenantId);
    if (!connection) return res.status(404).json({ error: 'Connection not found' });
    await db('bank_accounts').where({ connection_id: connection.id, tenant_id: req.tenantId }).update({
      connection_id: null,
      external_account_id: null,
    });
    await db('bank_connections').where({ id: connection.id }).del();
    await logAudit({
      entityType: 'bank_connection',
      entityId: connection.id,
      action: 'disconnect',
      userId: req.user.id,
      userName: req.user.name,
      ipAddress: req.ip,
      tenantId: req.tenantId,
    });
    res.json({ message: 'Bank connection removed. Imported transactions were kept.' });
  } catch (err) {
    console.error('Disconnect bank error:', err);
    res.status(500).json({ error: 'Could not disconnect' });
  }
});

module.exports = router;
