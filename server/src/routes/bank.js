const router = require('express').Router();
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logAudit } = require('../models/auditLog');
const { encrypt, decrypt } = require('../utils/encrypt');

let plaidClient = null;

// Initialize Plaid client if credentials are available
function getPlaidClient() {
  if (plaidClient) return plaidClient;

  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) return null;

  try {
    const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
    const configuration = new Configuration({
      basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    });
    plaidClient = new PlaidApi(configuration);
    return plaidClient;
  } catch (err) {
    console.warn('Plaid client not available:', err.message);
    return null;
  }
}

// GET /api/bank/accounts — list all bank accounts
router.get('/accounts', authenticate, requireTenant, async (req, res) => {
  const accounts = await db('bank_accounts').where({ is_active: true, tenant_id: req.tenantId });
  res.json(accounts);
});

// POST /api/bank/link-token — create a Plaid Link token (institution-agnostic, user picks their bank)
router.post('/link-token', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const client = getPlaidClient();
    if (!client) return res.status(503).json({ error: 'Plaid not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in server/.env' });

    const orgName = req.tenant?.name || process.env.ORG_NAME || 'StewardView';

    const response = await client.linkTokenCreate({
      user: { client_user_id: String(req.user.id) },
      client_name: orgName,
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
      // No institution_id — lets the user choose any bank from Plaid's 12,000+ institutions
    });

    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('Plaid link token error:', err);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

// POST /api/bank/exchange-token — exchange public token after Plaid Link
router.post('/exchange-token', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const client = getPlaidClient();
    if (!client) return res.status(503).json({ error: 'Plaid not configured' });

    const { public_token, institution, accounts } = req.body;

    const exchangeResponse = await client.itemPublicTokenExchange({ public_token });
    const accessToken = encrypt(exchangeResponse.data.access_token);

    // Save each linked account scoped to this tenant
    for (const account of accounts) {
      const [{ id }] = await db('bank_accounts').insert({
        name: `${institution.name} - ${account.name}`,
        institution: institution.name,
        account_mask: account.mask,
        plaid_account_id: account.id,
        plaid_access_token: accessToken,
        tenant_id: req.tenantId,
      }).returning('id');

      await logAudit({
        entityType: 'bank_account', entityId: id, action: 'link',
        newValues: { institution: institution.name, mask: account.mask },
        userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      });
    }

    res.json({ message: 'Bank account linked successfully', count: accounts.length });
  } catch (err) {
    console.error('Token exchange error:', err);
    res.status(500).json({ error: 'Failed to link bank account' });
  }
});

// POST /api/bank/sync — sync balances and transactions from all Plaid-linked accounts
router.post('/sync', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const client = getPlaidClient();
    if (!client) return res.status(503).json({ error: 'Plaid not configured' });

    const accounts = await db('bank_accounts')
      .whereNotNull('plaid_access_token')
      .where({ is_active: true, tenant_id: req.tenantId });

    const results = [];

    for (const account of accounts) {
      try {
        // Get balances
        const balanceResponse = await client.accountsBalanceGet({ access_token: decrypt(account.plaid_access_token) });
        const plaidAccount = balanceResponse.data.accounts.find(a => a.account_id === account.plaid_account_id);

        if (plaidAccount) {
          await db('bank_accounts').where({ id: account.id }).update({
            current_balance: plaidAccount.balances.current,
            available_balance: plaidAccount.balances.available,
            balance_last_updated: new Date().toISOString(),
          });
        }

        // Get recent transactions (last 30 days)
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const txnResponse = await client.transactionsGet({
          access_token: decrypt(account.plaid_access_token),
          start_date: startDate.toISOString().slice(0, 10),
          end_date: new Date().toISOString().slice(0, 10),
        });

        await db('bank_sync_log').insert({
          bank_account_id: account.id,
          status: 'success',
          transactions_synced: txnResponse.data.transactions.length,
        });

        results.push({
          account: account.name,
          balance: plaidAccount?.balances.current,
          transactions_found: txnResponse.data.transactions.length,
        });
      } catch (syncErr) {
        await db('bank_sync_log').insert({
          bank_account_id: account.id,
          status: 'error',
          error_message: syncErr.message,
        });
        results.push({ account: account.name, error: syncErr.message });
      }
    }

    await logAudit({
      entityType: 'bank_sync', entityId: 0, action: 'sync',
      newValues: { results },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.json({ message: 'Bank sync completed', results });
  } catch (err) {
    console.error('Bank sync error:', err);
    res.status(500).json({ error: 'Bank sync failed' });
  }
});

// GET /api/bank/balances — quick balance check
router.get('/balances', authenticate, requireTenant, async (req, res) => {
  const accounts = await db('bank_accounts')
    .where({ is_active: true, tenant_id: req.tenantId })
    .select('id', 'name', 'institution', 'account_mask', 'current_balance', 'available_balance', 'balance_last_updated', 'plaid_account_id');

  const total = accounts.reduce((sum, a) => sum + parseFloat(a.current_balance || 0), 0);
  res.json({ accounts, total_balance: total });
});

// GET /api/bank/sync-log — view sync history
router.get('/sync-log', authenticate, async (req, res) => {
  const log = await db('bank_sync_log')
    .leftJoin('bank_accounts', 'bank_sync_log.bank_account_id', 'bank_accounts.id')
    .select('bank_sync_log.*', 'bank_accounts.name as account_name')
    .orderBy('synced_at', 'desc')
    .limit(50);
  res.json(log);
});

// POST /api/bank/sync/:id — sync a single Plaid account by id
router.post('/sync/:id', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const client = getPlaidClient();
    if (!client) return res.status(503).json({ error: 'Plaid not configured' });

    const account = await db('bank_accounts').where({ id: req.params.id, is_active: true, tenant_id: req.tenantId }).first();
    if (!account) return res.status(404).json({ error: 'Account not found' });
    if (!account.plaid_access_token) return res.status(400).json({ error: 'Not a Plaid-linked account' });

    const balanceResponse = await client.accountsBalanceGet({ access_token: decrypt(account.plaid_access_token) });
    const plaidAcc = balanceResponse.data.accounts.find(a => a.account_id === account.plaid_account_id);

    if (plaidAcc) {
      await db('bank_accounts').where({ id: account.id }).update({
        current_balance: plaidAcc.balances.current,
        available_balance: plaidAcc.balances.available,
        balance_last_updated: new Date().toISOString(),
      });
    }

    await db('bank_sync_log').insert({ bank_account_id: account.id, status: 'success', transactions_synced: 0 });
    res.json({ message: 'Account synced', balance: plaidAcc?.balances.current });
  } catch (err) {
    console.error('Single account sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bank/accounts — create a manual (non-Plaid) bank account
router.post('/accounts', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { name, institution, account_mask, current_balance, available_balance, account_type } = req.body;
    if (!name || !institution) return res.status(400).json({ error: 'name and institution are required' });

    const [{ id }] = await db('bank_accounts').insert({
      name,
      institution,
      account_mask: account_mask || null,
      current_balance: parseFloat(current_balance) || 0,
      available_balance: parseFloat(available_balance || current_balance) || 0,
      account_type: account_type || 'checking',
      balance_last_updated: new Date().toISOString(),
      tenant_id: req.tenantId,
    }).returning('id');

    await logAudit({
      entityType: 'bank_account', entityId: id, action: 'create',
      newValues: { name, institution },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.status(201).json({ id, message: 'Account created' });
  } catch (err) {
    console.error('Create account error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// PUT /api/bank/accounts/:id — update a bank account (name, institution, or manual balance)
router.put('/accounts/:id', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const account = await db('bank_accounts').where({ id: req.params.id, is_active: true, tenant_id: req.tenantId }).first();
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const { name, institution, account_mask, current_balance, available_balance } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (institution !== undefined) updates.institution = institution;
    if (account_mask !== undefined) updates.account_mask = account_mask;
    if (current_balance !== undefined) {
      updates.current_balance = parseFloat(current_balance);
      updates.balance_last_updated = new Date().toISOString();
    }
    if (available_balance !== undefined) updates.available_balance = parseFloat(available_balance);

    await db('bank_accounts').where({ id: req.params.id }).update(updates);

    await logAudit({
      entityType: 'bank_account', entityId: req.params.id, action: 'update',
      oldValues: account, newValues: updates,
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.json({ message: 'Account updated' });
  } catch (err) {
    console.error('Update account error:', err);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// DELETE /api/bank/accounts/:id — deactivate (soft-delete) a bank account
router.delete('/accounts/:id', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const account = await db('bank_accounts').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    if (!account) return res.status(404).json({ error: 'Account not found' });

    await db('bank_accounts').where({ id: req.params.id }).update({ is_active: false });

    await logAudit({
      entityType: 'bank_account', entityId: req.params.id, action: 'deactivate',
      oldValues: { name: account.name }, newValues: { is_active: false },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.json({ message: 'Account removed' });
  } catch (err) {
    console.error('Deactivate account error:', err);
    res.status(500).json({ error: 'Failed to remove account' });
  }
});

module.exports = router;
