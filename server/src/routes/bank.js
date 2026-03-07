const router = require('express').Router();
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../models/auditLog');

let plaidClient = null;

// Initialize Plaid client if credentials are available
function getPlaidClient() {
  if (plaidClient) return plaidClient;

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
router.get('/accounts', authenticate, async (req, res) => {
  const accounts = await db('bank_accounts').where({ is_active: true });
  res.json(accounts);
});

// POST /api/bank/link-token — create a Plaid Link token to connect Bank of America
router.post('/link-token', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const client = getPlaidClient();
    if (!client) return res.status(503).json({ error: 'Plaid not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in .env' });

    const response = await client.linkTokenCreate({
      user: { client_user_id: String(req.user.id) },
      client_name: 'HRCOC Finance',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
      institution_id: 'ins_127989', // Bank of America institution ID in Plaid
    });

    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('Plaid link token error:', err);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

// POST /api/bank/exchange-token — exchange public token after Plaid Link
router.post('/exchange-token', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const client = getPlaidClient();
    if (!client) return res.status(503).json({ error: 'Plaid not configured' });

    const { public_token, institution, accounts } = req.body;

    const exchangeResponse = await client.itemPublicTokenExchange({ public_token });
    const accessToken = exchangeResponse.data.access_token;

    // Save each linked account
    for (const account of accounts) {
      const [id] = await db('bank_accounts').insert({
        name: `${institution.name} - ${account.name}`,
        institution: institution.name,
        account_mask: account.mask,
        plaid_account_id: account.id,
        plaid_access_token: accessToken, // In production, encrypt this
      });

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

// POST /api/bank/sync — sync balances and transactions from Bank of America
router.post('/sync', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const client = getPlaidClient();
    if (!client) return res.status(503).json({ error: 'Plaid not configured' });

    const accounts = await db('bank_accounts').whereNotNull('plaid_access_token').where({ is_active: true });

    const results = [];

    for (const account of accounts) {
      try {
        // Get balances
        const balanceResponse = await client.accountsBalanceGet({ access_token: account.plaid_access_token });
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
          access_token: account.plaid_access_token,
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
router.get('/balances', authenticate, async (req, res) => {
  const accounts = await db('bank_accounts')
    .where({ is_active: true })
    .select('id', 'name', 'institution', 'account_mask', 'current_balance', 'available_balance', 'balance_last_updated');

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

module.exports = router;
