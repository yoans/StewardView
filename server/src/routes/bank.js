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
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

function getValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  }
  return '';
}

function parseMoney(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const isNegative = /^\(.+\)$/.test(text) || text.includes('-');
  const numeric = parseFloat(text.replace(/[$,()\s]/g, '').replace('-', ''));
  if (Number.isNaN(numeric)) return null;
  return isNegative ? -numeric : numeric;
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  const dateParts = text.match(/^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!dateParts) return null;

  const [, first, second, third] = dateParts;
  let normalized;
  if (first.length === 4) {
    normalized = `${first}-${second.padStart(2, '0')}-${third.padStart(2, '0')}`;
  } else {
    normalized = `${third.length === 2 ? '20' + third : third}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`;
  }

  const parsed = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized ? null : normalized;
}

function uploadCsv(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'CSV file must be 5 MB or smaller' });
    }
    return res.status(400).json({ error: err.message || 'CSV upload failed' });
  });
}

// GET /api/bank/accounts — list all bank accounts
router.get('/accounts', authenticate, requireTenant, async (req, res) => {
  const accounts = await db('bank_accounts').where({ is_active: true, tenant_id: req.tenantId });
  res.json(accounts);
});

// POST /api/bank/import — import transactions from a CSV file into a bank account
//
// Expected CSV columns are flexible and case-insensitive. Common bank exports work with:
//   date/posting_date, amount OR debit/credit, description/memo/details, check_number, notes
//
// Amount signs are normalized so expenses are stored as positive amounts with type = expense.
//
router.post('/import', authenticate, requireTenant, authorize('admin', 'treasurer'), uploadCsv, async (req, res) => {
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

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const [i, row] of records.entries()) {
      try {
        const dateValue = getValue(row, ['date', 'posted_date', 'posting_date', 'transaction_date']);
        const parsedDate = normalizeDate(dateValue);
        if (!parsedDate) { errors.push(`Row ${i + 2}: invalid date "${dateValue || 'blank'}"`); skipped++; continue; }

        const debit = parseMoney(getValue(row, ['debit', 'withdrawal', 'withdrawals', 'payment', 'payments']));
        const credit = parseMoney(getValue(row, ['credit', 'deposit', 'deposits']));
        let rawAmount = parseMoney(getValue(row, ['amount', 'transaction_amount']));

        if (rawAmount === null) {
          if (debit !== null) rawAmount = -Math.abs(debit);
          if (credit !== null) rawAmount = Math.abs(credit);
        }
        if (rawAmount === null || rawAmount === 0) { skipped++; continue; }

        const amount = Math.abs(rawAmount);

        // Determine type from explicit column or sign of amount
        let type = (row.type || '').toLowerCase().trim();
        if (type !== 'income' && type !== 'expense') {
          type = rawAmount < 0 ? 'expense' : 'income';
        }

        const description = String(getValue(row, ['description', 'memo', 'details', 'name', 'transaction_description']) || 'Imported transaction').trim().slice(0, 255);
        const payee = String(getValue(row, ['payee', 'payee_payer', 'name'])).trim().slice(0, 255) || null;
        const checkNumber = String(getValue(row, ['check_number', 'check_no', 'check', 'check_#'])).trim() || null;
        const notes = String(getValue(row, ['notes', 'note', 'memo'])).trim() || null;

        const duplicate = await db('transactions')
          .where({
            tenant_id: req.tenantId,
            bank_account_id: account.id,
            date: parsedDate,
            type,
            amount,
            description,
          })
          .modify((query) => {
            if (checkNumber) query.where('check_number', checkNumber);
          })
          .first();

        if (duplicate) { skipped++; continue; }

        await db('transactions').insert({
          ref_number: `IMP-${uuidv4().slice(0, 8).toUpperCase()}`,
          type,
          amount,
          date: parsedDate,
          description,
          payee_payer: payee,
          check_number: checkNumber,
          bank_account_id: account.id,
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

// POST /api/bank/accounts — create a bank account
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
