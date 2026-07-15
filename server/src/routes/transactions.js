const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logAudit } = require('../models/auditLog');
const { getGeneralFund, applyFundMovement, reverseFundMovement, resolveExpenseFundId } = require('../utils/fundBank');

// GET /api/transactions
router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const { type, category_id, fund_id, status, start_date, end_date } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

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
    const { type, amount, date, description, payee_payer, check_number, category_id, bank_account_id, notes } = req.body;
    let { fund_id } = req.body;

    if (type === 'expense') {
      try {
        fund_id = await resolveExpenseFundId(req.tenantId, fund_id || null);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    } else if (!fund_id && type === 'income') {
      const generalFund = await getGeneralFund(req.tenantId);
      if (generalFund) fund_id = generalFund.id;
    }

    const ref_number = uuidv4();
    let id;
    await db.transaction(async (trx) => {
      const [row] = await trx('transactions').insert({
        ref_number, type, amount, date, description, payee_payer,
        check_number, category_id, bank_account_id, fund_id,
        notes, status: 'cleared', created_by: req.user.id,
        tenant_id: req.tenantId,
      }).returning('id');
      id = row.id;

      if (fund_id) {
        await applyFundMovement({
          fundId: fund_id,
          transactionId: id,
          type,
          amount,
          date,
          description,
          payeePayer: payee_payer,
          userId: req.user.id,
          tenantId: req.tenantId,
          trx,
        });
      }
    });

    await logAudit({
      entityType: 'transaction', entityId: id, action: 'create',
      newValues: { ref_number, type, amount, date, description, category_id, fund_id, payee_payer, status: 'cleared' },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId || req.user?.tenant_id || null,
    });

    const txn = await db('transactions').where({ id }).first();
    res.status(201).json(txn);
  } catch (err) {
    console.error('Create transaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/transactions/:id
router.put('/:id', authenticate, requireTenant, authorize('admin', 'treasurer', 'finance_committee'), async (req, res) => {
  try {
    const existing = await db('transactions').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    if (!existing) return res.status(404).json({ error: 'Transaction not found' });

    const updates = {};
    const fields = ['type', 'amount', 'date', 'description', 'payee_payer', 'check_number', 'category_id', 'bank_account_id', 'fund_id', 'status', 'notes'];
    fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    if (updates.status !== undefined) {
      const allowed = ['pending', 'cleared', 'reconciled', 'void'];
      if (!allowed.includes(updates.status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      if (existing.status === 'void' && updates.status !== 'void') {
        return res.status(400).json({ error: 'Voided transactions cannot be reopened' });
      }
    }

    const nextType = updates.type !== undefined ? updates.type : existing.type;
    let nextFundId = updates.fund_id !== undefined ? updates.fund_id : existing.fund_id;
    const nextAmount = updates.amount !== undefined ? updates.amount : existing.amount;
    const nextStatus = updates.status !== undefined ? updates.status : existing.status;
    const nextDate = updates.date !== undefined ? updates.date : existing.date;
    const nextDescription = updates.description !== undefined ? updates.description : existing.description;
    const nextPayee = updates.payee_payer !== undefined ? updates.payee_payer : existing.payee_payer;

    if (nextType === 'expense' && nextStatus !== 'void') {
      try {
        nextFundId = await resolveExpenseFundId(req.tenantId, nextFundId || null);
        updates.fund_id = nextFundId;
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    updates.updated_at = new Date().toISOString();

    await db.transaction(async (trx) => {
      const wasActive = existing.status !== 'void';
      const willBeActive = nextStatus !== 'void';

      if (wasActive && existing.fund_id) {
        await reverseFundMovement({
          fundId: existing.fund_id,
          type: existing.type,
          amount: existing.amount,
          tenantId: req.tenantId,
          transactionId: existing.id,
          trx,
        });
      }

      await trx('transactions').where({ id: req.params.id }).update(updates);

      if (willBeActive && nextFundId) {
        await applyFundMovement({
          fundId: nextFundId,
          transactionId: existing.id,
          type: nextType,
          amount: nextAmount,
          date: nextDate,
          description: nextDescription,
          payeePayer: nextPayee,
          userId: req.user.id,
          tenantId: req.tenantId,
          trx,
        });
      }
    });

    await logAudit({
      entityType: 'transaction', entityId: existing.id, action: 'update',
      oldValues: existing, newValues: updates,
      changeReason: req.body.change_reason,
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId || req.user?.tenant_id || null,
    });

    const updated = await db('transactions')
      .leftJoin('funds', 'transactions.fund_id', 'funds.id')
      .select('transactions.*', 'funds.name as fund_name')
      .where('transactions.id', req.params.id)
      .first();
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

    await db.transaction(async (trx) => {
      if (existing.status !== 'void' && existing.fund_id) {
        await reverseFundMovement({
          fundId: existing.fund_id,
          type: existing.type,
          amount: existing.amount,
          tenantId: req.tenantId,
          transactionId: existing.id,
          trx,
        });
      }
      await trx('transactions').where({ id: req.params.id }).update({ status: 'void', updated_at: new Date().toISOString() });
    });

    await logAudit({
      entityType: 'transaction', entityId: existing.id, action: 'void',
      oldValues: { amount: existing.amount, date: existing.date, description: existing.description, status: existing.status, fund_id: existing.fund_id },
      newValues: { status: 'void' },
      changeReason: req.body.change_reason || 'Transaction canceled',
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId || req.user?.tenant_id || null,
    });

    res.json({ message: 'Transaction canceled', id: existing.id });
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
