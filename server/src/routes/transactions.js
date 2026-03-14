const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logAudit } = require('../models/auditLog');

// GET /api/transactions
router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const { type, category_id, fund_id, status, start_date, end_date, limit = 100, offset = 0 } = req.query;

    let query = db('transactions')
      .leftJoin('categories', 'transactions.category_id', 'categories.id')
      .leftJoin('funds', 'transactions.fund_id', 'funds.id')
      .leftJoin('bank_accounts', 'transactions.bank_account_id', 'bank_accounts.id')
      .select(
        'transactions.*',
        'categories.name as category_name',
        'funds.name as fund_name',
        'bank_accounts.name as account_name'
      )
      .where('transactions.tenant_id', req.tenantId)
      .orderBy('transactions.date', 'desc')
      .limit(limit)
      .offset(offset);

    if (type) query = query.where('transactions.type', type);
    if (category_id) query = query.where('transactions.category_id', category_id);
    if (fund_id) query = query.where('transactions.fund_id', fund_id);
    if (status) query = query.where('transactions.status', status);
    if (start_date) query = query.where('transactions.date', '>=', start_date);
    if (end_date) query = query.where('transactions.date', '<=', end_date);

    const transactions = await query;
    res.json(transactions);
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/transactions/:id
router.get('/:id', authenticate, requireTenant, async (req, res) => {
  const txn = await db('transactions')
    .leftJoin('categories', 'transactions.category_id', 'categories.id')
    .leftJoin('funds', 'transactions.fund_id', 'funds.id')
    .select('transactions.*', 'categories.name as category_name', 'funds.name as fund_name')
    .where('transactions.id', req.params.id)
    .where('transactions.tenant_id', req.tenantId)
    .first();
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });
  res.json(txn);
});

// POST /api/transactions
router.post('/', authenticate, requireTenant, authorize('admin', 'treasurer', 'finance_committee'), async (req, res) => {
  try {
    const { type, amount, date, description, payee_payer, check_number, category_id, bank_account_id, fund_id, notes } = req.body;

    const ref_number = uuidv4();
    const [{ id }] = await db('transactions').insert({
      ref_number, type, amount, date, description, payee_payer,
      check_number, category_id, bank_account_id, fund_id,
      notes, status: 'pending', created_by: req.user.id,
      tenant_id: req.tenantId,
    }).returning('id');

    // If directed to a fund, create fund transaction
    if (fund_id) {
      const fundType = type === 'income' ? 'contribution' : 'disbursement';
      await db('fund_transactions').insert({
        fund_id, transaction_id: id, type: fundType,
        amount, date, description,
        donor_name: payee_payer || null,
        created_by: req.user.id,
      });

      // Update fund balance
      const balanceChange = type === 'income' ? amount : -amount;
      await db('funds').where({ id: fund_id }).increment('current_balance', balanceChange);
    }

    await logAudit({
      entityType: 'transaction', entityId: id, action: 'create',
      newValues: { ref_number, type, amount, date, description, category_id, fund_id },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    const txn = await db('transactions').where({ id }).first();
    res.status(201).json(txn);
  } catch (err) {
    console.error('Create transaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/transactions/:id
router.put('/:id', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const existing = await db('transactions').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    if (!existing) return res.status(404).json({ error: 'Transaction not found' });

    const updates = {};
    const fields = ['type', 'amount', 'date', 'description', 'payee_payer', 'check_number', 'category_id', 'bank_account_id', 'fund_id', 'status', 'notes'];
    fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    updates.updated_at = new Date().toISOString();

    await db('transactions').where({ id: req.params.id }).update(updates);

    await logAudit({
      entityType: 'transaction', entityId: existing.id, action: 'update',
      oldValues: existing, newValues: updates,
      changeReason: req.body.change_reason,
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    const updated = await db('transactions').where({ id: req.params.id }).first();
    res.json(updated);
  } catch (err) {
    console.error('Update transaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/transactions/:id  (soft-delete: sets status to void)
router.delete('/:id', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const existing = await db('transactions').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    if (!existing) return res.status(404).json({ error: 'Transaction not found' });

    await db('transactions').where({ id: req.params.id }).update({ status: 'void', updated_at: new Date().toISOString() });

    await logAudit({
      entityType: 'transaction', entityId: existing.id, action: 'void',
      oldValues: existing,
      changeReason: req.body.change_reason || 'Transaction voided',
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.json({ message: 'Transaction voided', id: existing.id });
  } catch (err) {
    console.error('Void transaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/transactions/summary/:year/:month
router.get('/summary/:year/:month', authenticate, requireTenant, async (req, res) => {
  try {
    const { year, month } = req.params;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

    const income = await db('transactions')
      .where('type', 'income')
      .where('status', '!=', 'void')
      .where('tenant_id', req.tenantId)
      .whereBetween('date', [startDate, endDate])
      .sum('amount as total')
      .first();

    const expenses = await db('transactions')
      .where('type', 'expense')
      .where('status', '!=', 'void')
      .where('tenant_id', req.tenantId)
      .whereBetween('date', [startDate, endDate])
      .sum('amount as total')
      .first();

    const byCategory = await db('transactions')
      .leftJoin('categories', 'transactions.category_id', 'categories.id')
      .where('transactions.status', '!=', 'void')
      .where('transactions.tenant_id', req.tenantId)
      .whereBetween('transactions.date', [startDate, endDate])
      .groupBy('categories.name', 'transactions.type')
      .select('categories.name as category', 'transactions.type')
      .sum('transactions.amount as total');

    res.json({
      year: parseInt(year),
      month: parseInt(month),
      total_income: income.total || 0,
      total_expenses: expenses.total || 0,
      net: (income.total || 0) - (expenses.total || 0),
      by_category: byCategory,
    });
  } catch (err) {
    console.error('Transaction summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
