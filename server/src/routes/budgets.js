const router = require('express').Router();
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logAudit } = require('../models/auditLog');
const { budgetSnapshot, currentMonth } = require('../utils/budgetReport');

/** Last calendar day of month as YYYY-MM-DD (no UTC shift). */
function monthEndDate(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

// GET /api/budgets?year=2026
router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const budgets = await db('budgets')
      .leftJoin('categories', 'budgets.category_id', 'categories.id')
      .where('budgets.year', year)
      .where('budgets.tenant_id', req.tenantId)
      .select('budgets.*', 'categories.name as category_name', 'categories.type as category_type')
      .orderBy(['budgets.month', 'categories.type', 'categories.name']);

    res.json(budgets);
  } catch (err) {
    console.error('Get budgets error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/budgets/vs-actual?year=2026&month=3
router.get('/vs-actual', authenticate, requireTenant, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = monthEndDate(year, month);
    const snapshot = await budgetSnapshot({
      tenantId: req.tenantId,
      year,
      startDate,
      endDate,
      budgetQuery: db('budgets')
        .where({ year, month, tenant_id: req.tenantId })
        .groupBy('category_id')
        .select('category_id')
        .sum('budgeted_amount as budgeted'),
    });

    res.json({ ...snapshot, month });
  } catch (err) {
    console.error('Budget vs actual error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/budgets — create or update budget line
router.post('/', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { year, month, category_id, budgeted_amount, notes } = req.body;

    const existing = await db('budgets').where({ year, month, category_id, tenant_id: req.tenantId }).first();

    if (existing) {
      await db('budgets').where({ id: existing.id }).update({ budgeted_amount, notes, updated_at: new Date().toISOString() });
      await logAudit({
        entityType: 'budget', entityId: existing.id, action: 'update',
        oldValues: { budgeted_amount: existing.budgeted_amount },
        newValues: { budgeted_amount },
        userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
        tenantId: req.tenantId || req.user?.tenant_id || null,
      });
      const updated = await db('budgets').where({ id: existing.id }).first();
      return res.json(updated);
    }

    const [{ id }] = await db('budgets').insert({ year, month, category_id, budgeted_amount, notes, created_by: req.user.id, tenant_id: req.tenantId }).returning('id');
    await logAudit({
      entityType: 'budget', entityId: id, action: 'create',
      newValues: { year, month, category_id, budgeted_amount },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId || req.user?.tenant_id || null,
    });

    const budget = await db('budgets').where({ id }).first();
    res.status(201).json(budget);
  } catch (err) {
    console.error('Create/update budget error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/budgets/:id — edit a specific budget line
router.put('/:id', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const existing = await db('budgets').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    if (!existing) return res.status(404).json({ error: 'Budget entry not found' });

    const updates = {};
    ['budgeted_amount', 'notes', 'category_id', 'year', 'month'].forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });
    updates.updated_at = new Date().toISOString();

    await db('budgets').where({ id: req.params.id }).update(updates);

    await logAudit({
      entityType: 'budget', entityId: existing.id, action: 'update',
      oldValues: { budgeted_amount: existing.budgeted_amount, notes: existing.notes },
      newValues: updates,
      changeReason: req.body.change_reason,
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId || req.user?.tenant_id || null,
    });

    const updated = await db('budgets')
      .leftJoin('categories', 'budgets.category_id', 'categories.id')
      .where('budgets.id', req.params.id)
      .select('budgets.*', 'categories.name as category_name', 'categories.type as category_type')
      .first();
    res.json(updated);
  } catch (err) {
    console.error('Update budget error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/budgets/:id — delete a budget line
router.delete('/:id', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const existing = await db('budgets').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    if (!existing) return res.status(404).json({ error: 'Budget entry not found' });

    await db('budgets').where({ id: req.params.id }).del();

    await logAudit({
      entityType: 'budget', entityId: existing.id, action: 'delete',
      oldValues: existing,
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId || req.user?.tenant_id || null,
    });

    res.json({ message: 'Budget entry deleted', id: existing.id });
  } catch (err) {
    console.error('Delete budget error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/budgets/copy — copy budget from one month/year to another
router.post('/copy', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { from_year, from_month, to_year, to_month } = req.body;

    const sourceBudgets = await db('budgets').where({ year: from_year, month: from_month, tenant_id: req.tenantId });
    if (sourceBudgets.length === 0) return res.status(404).json({ error: 'No budget found for source period' });

    // Delete existing target budgets for this tenant
    await db('budgets').where({ year: to_year, month: to_month, tenant_id: req.tenantId }).del();

    const newBudgets = sourceBudgets.map(b => ({
      year: to_year, month: to_month, category_id: b.category_id,
      budgeted_amount: b.budgeted_amount, notes: `Copied from ${from_year}-${from_month}`,
      created_by: req.user.id, tenant_id: req.tenantId,
    }));

    await db('budgets').insert(newBudgets);

    await logAudit({
      entityType: 'budget', entityId: 0, action: 'copy',
      newValues: { from: `${from_year}-${from_month}`, to: `${to_year}-${to_month}`, count: newBudgets.length },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId || req.user?.tenant_id || null,
    });

    res.json({ message: `Copied ${newBudgets.length} budget lines`, from: `${from_year}-${from_month}`, to: `${to_year}-${to_month}` });
  } catch (err) {
    console.error('Copy budget error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/budgets/fill-year — use one month as the plan for every month of that year
router.post('/fill-year', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const year = parseInt(req.body.year, 10);
    const month = parseInt(req.body.month, 10);
    if (!year || month < 1 || month > 12) return res.status(400).json({ error: 'Choose a year and month' });

    const source = await db('budgets').where({ year, month, tenant_id: req.tenantId });
    if (!source.length) return res.status(404).json({ error: 'Set this month before copying it to the rest of the year' });

    await db.transaction(async (trx) => {
      await trx('budgets').where({ year, tenant_id: req.tenantId }).whereNot({ month }).del();
      const copies = [];
      for (let target = 1; target <= 12; target += 1) {
        if (target === month) continue;
        source.forEach((line) => {
          copies.push({
            year,
            month: target,
            category_id: line.category_id,
            budgeted_amount: line.budgeted_amount,
            notes: `Same plan as month ${month}`,
            created_by: req.user.id,
            tenant_id: req.tenantId,
          });
        });
      }
      if (copies.length) await trx('budgets').insert(copies);
    });

    res.json({ message: `${MONTHS[month] || 'This month'} is now the plan for all of ${year}` });
  } catch (err) {
    console.error('Fill year budget error:', err);
    res.status(500).json({ error: 'Could not copy the plan' });
  }
});

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// GET /api/budgets/ytd?year=2026
router.get('/ytd', authenticate, requireTenant, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const throughMonth = year === new Date().getFullYear() ? currentMonth() : 12;
    const startDate = `${year}-01-01`;
    const endDate = monthEndDate(year, throughMonth);
    const snapshot = await budgetSnapshot({
      tenantId: req.tenantId,
      year,
      startDate,
      endDate,
      monthsInPlan: throughMonth,
      budgetQuery: db('budgets')
        .where({ year, tenant_id: req.tenantId })
        .where('month', '<=', throughMonth)
        .where('month', '>', 0)
        .groupBy('category_id')
        .select('category_id')
        .sum('budgeted_amount as budgeted'),
    });

    res.json({ ...snapshot, through_month: throughMonth });
  } catch (err) {
    console.error('YTD budget error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
