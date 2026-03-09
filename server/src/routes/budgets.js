const router = require('express').Router();
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logAudit } = require('../models/auditLog');

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
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

    // Get budgets for the month
    const budgets = await db('budgets')
      .leftJoin('categories', 'budgets.category_id', 'categories.id')
      .where({ 'budgets.year': year, 'budgets.month': month, 'budgets.tenant_id': req.tenantId })
      .select('budgets.*', 'categories.name as category_name', 'categories.type as category_type');

    // Get actuals by category
    const actuals = await db('transactions')
      .where('status', '!=', 'void')
      .where('tenant_id', req.tenantId)
      .whereBetween('date', [startDate, endDate])
      .groupBy('category_id')
      .select('category_id')
      .sum('amount as actual_amount');

    const actualMap = {};
    actuals.forEach(a => { actualMap[a.category_id] = parseFloat(a.actual_amount) || 0; });

    const comparison = budgets.map(b => ({
      category_id: b.category_id,
      category_name: b.category_name,
      category_type: b.category_type,
      budgeted: parseFloat(b.budgeted_amount),
      actual: actualMap[b.category_id] || 0,
      variance: (actualMap[b.category_id] || 0) - parseFloat(b.budgeted_amount),
      variance_pct: b.budgeted_amount > 0
        ? (((actualMap[b.category_id] || 0) - parseFloat(b.budgeted_amount)) / parseFloat(b.budgeted_amount) * 100).toFixed(1)
        : 0,
    }));

    const totalBudgetedIncome = comparison.filter(c => c.category_type === 'income').reduce((s, c) => s + c.budgeted, 0);
    const totalActualIncome = comparison.filter(c => c.category_type === 'income').reduce((s, c) => s + c.actual, 0);
    const totalBudgetedExpense = comparison.filter(c => c.category_type === 'expense').reduce((s, c) => s + c.budgeted, 0);
    const totalActualExpense = comparison.filter(c => c.category_type === 'expense').reduce((s, c) => s + c.actual, 0);

    res.json({
      year, month,
      line_items: comparison,
      summary: {
        total_budgeted_income: totalBudgetedIncome,
        total_actual_income: totalActualIncome,
        total_budgeted_expense: totalBudgetedExpense,
        total_actual_expense: totalActualExpense,
        budgeted_net: totalBudgetedIncome - totalBudgetedExpense,
        actual_net: totalActualIncome - totalActualExpense,
      },
    });
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
      });
      const updated = await db('budgets').where({ id: existing.id }).first();
      return res.json(updated);
    }

    const [id] = await db('budgets').insert({ year, month, category_id, budgeted_amount, notes, created_by: req.user.id, tenant_id: req.tenantId });
    await logAudit({
      entityType: 'budget', entityId: id, action: 'create',
      newValues: { year, month, category_id, budgeted_amount },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
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
    });

    res.json({ message: `Copied ${newBudgets.length} budget lines`, from: `${from_year}-${from_month}`, to: `${to_year}-${to_month}` });
  } catch (err) {
    console.error('Copy budget error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/budgets/ytd?year=2026
router.get('/ytd', authenticate, requireTenant, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const startDate = `${year}-01-01`;
    const endDate = new Date(year, currentMonth, 0).toISOString().slice(0, 10);

    // YTD budgeted (sum months 1 through current)
    const ytdBudgets = await db('budgets')
      .leftJoin('categories', 'budgets.category_id', 'categories.id')
      .where('budgets.year', year)
      .where('budgets.month', '<=', currentMonth)
      .where('budgets.tenant_id', req.tenantId)
      .groupBy('budgets.category_id', 'categories.name', 'categories.type')
      .select('budgets.category_id', 'categories.name as category_name', 'categories.type as category_type')
      .sum('budgets.budgeted_amount as ytd_budgeted');

    // YTD actuals
    const ytdActuals = await db('transactions')
      .where('status', '!=', 'void')
      .where('tenant_id', req.tenantId)
      .whereBetween('date', [startDate, endDate])
      .groupBy('category_id')
      .select('category_id')
      .sum('amount as ytd_actual');

    const actualMap = {};
    ytdActuals.forEach(a => { actualMap[a.category_id] = parseFloat(a.ytd_actual) || 0; });

    const comparison = ytdBudgets.map(b => ({
      category_id: b.category_id,
      category_name: b.category_name,
      category_type: b.category_type,
      ytd_budgeted: parseFloat(b.ytd_budgeted),
      ytd_actual: actualMap[b.category_id] || 0,
      ytd_variance: (actualMap[b.category_id] || 0) - parseFloat(b.ytd_budgeted),
    }));

    res.json({ year, through_month: currentMonth, line_items: comparison });
  } catch (err) {
    console.error('YTD budget error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
