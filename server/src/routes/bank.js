const router = require('express').Router();
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logAudit } = require('../models/auditLog');
const multer = require('multer');
const { parse } = require('csv-parse');
const { v4: uuidv4 } = require('uuid');

// Multer: memory storage, CSV only, 5 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

// GET /api/bank/accounts — list all bank accounts
router.get('/accounts', authenticate, requireTenant, async (req, res) => {
  const accounts = await db('bank_accounts').where({ is_active: true, tenant_id: req.tenantId });
  res.json(accounts);
});

// POST /api/bank/import — import transactions from a CSV file into a bank account
//
// Expected CSV columns (case-insensitive, flexible):
//   date, description, amount, type (optional), check_number (optional), notes (optional)
//
// "amount" is always a positive number; "type" should be "income" or "expense".
// If "type" is omitted, negative amounts are treated as expenses and positive as income.
//
router.post('/import', authenticate, requireTenant, authorize('admin', 'treasurer'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });

    const { bank_account_id } = req.body;
    if (!bank_account_id) return res.status(400).json({ error: 'bank_account_id is required' });

    const account = await db('bank_accounts').where({ id: bank_account_id, is_active: true, tenant_id: req.tenantId }).first();
    if (!account) return res.status(404).json({ error: 'Bank account not found' });

    // Parse CSV from buffer
    const records = await new Promise((resolve, reject) => {
      parse(req.file.buffer, {
        columns: (header) => header.map(h => h.trim().toLowerCase().replace(/\s+/g, '_')),
        skip_empty_lines: true,
        trim: true,
      }, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (!records.length) return res.status(400).json({ error: 'CSV file is empty' });

    // Validate that required columns exist
    const firstRow = records[0];
    if (!firstRow.date || firstRow.amount === undefined) {
      return res.status(400).json({ error: 'CSV must have at least "date" and "amount" columns' });
    }

    const defaultCategoryId = (await db('categories').where({ tenant_id: req.tenantId }).first())?.id || null;

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const [i, row] of records.entries()) {
      try {
        const rawAmount = parseFloat(String(row.amount).replace(/[$,]/g, ''));
        if (isNaN(rawAmount)) { skipped++; continue; }

        const amount = Math.abs(rawAmount);

        // Determine type from explicit column or sign of amount
        let type = (row.type || '').toLowerCase().trim();
        if (type !== 'income' && type !== 'expense') {
          type = rawAmount < 0 ? 'expense' : 'income';
        }

        // Normalise date — accept MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD
        const dateParts = String(row.date).match(/(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (!dateParts) { errors.push(`Row ${i + 2}: invalid date "${row.date}"`); skipped++; continue; }
        let parsedDate;
        const [, a, b, c] = dateParts;
        if (a.length === 4) {
          parsedDate = `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
        } else {
          parsedDate = `${c.length === 2 ? '20' + c : c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
        }

        const description = (row.description || row.memo || row.payee || 'Imported transaction').trim().slice(0, 255);
        const payee = (row.payee || row.payee_payer || '').trim().slice(0, 255) || null;
        const checkNumber = (row.check_number || row.check_no || row.check || '').trim() || null;
        const notes = (row.notes || row.note || row.memo || '').trim() || null;

        await db('transactions').insert({
          ref_number: `IMP-${uuidv4().slice(0, 8).toUpperCase()}`,
          type,
          amount,
          date: parsedDate,
          description,
          payee_payer: payee,
          check_number: checkNumber,
          bank_account_id: account.id,
          category_id: defaultCategoryId,
          status: 'cleared',
          notes,
          created_by: req.user.id,
          tenant_id: req.tenantId,
        });

        imported++;
      } catch (rowErr) {
        errors.push(`Row ${i + 2}: ${rowErr.message}`);
        skipped++;
      }
    }

    await logAudit({
      entityType: 'bank_import', entityId: account.id, action: 'import',
      newValues: { file: req.file.originalname, imported, skipped },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip, tenantId: req.tenantId,
    });

    res.json({ message: `Import complete`, imported, skipped, errors: errors.slice(0, 20) });
  } catch (err) {
    if (err.message === 'Only CSV files are accepted') return res.status(400).json({ error: err.message });
    console.error('CSV import error:', err);
    res.status(500).json({ error: 'Import failed' });
  }
});

// GET /api/bank/balances — quick balance check
router.get('/balances', authenticate, requireTenant, async (req, res) => {
  const accounts = await db('bank_accounts')
    .where({ is_active: true, tenant_id: req.tenantId })
    .select('id', 'name', 'institution', 'account_mask', 'account_type', 'current_balance', 'available_balance', 'balance_last_updated');

  const total = accounts.reduce((sum, a) => sum + parseFloat(a.current_balance || 0), 0);
  res.json({ accounts, total_balance: total });
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
