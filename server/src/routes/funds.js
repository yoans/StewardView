const router = require('express').Router();
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logAudit } = require('../models/auditLog');

// GET /api/funds — list all funds with balances
router.get('/', authenticate, requireTenant, async (req, res) => {
  const funds = await db('funds').where({ is_active: true, tenant_id: req.tenantId }).orderBy('name');
  res.json(funds);
});

// GET /api/funds/:id — single fund with recent activity
router.get('/:id', authenticate, requireTenant, async (req, res) => {
  const fund = await db('funds').where({ id: req.params.id, tenant_id: req.tenantId }).first();
  if (!fund) return res.status(404).json({ error: 'Fund not found' });

  const recentActivity = await db('fund_transactions')
    .where({ fund_id: req.params.id })
    .orderBy('date', 'desc')
    .limit(50);

  res.json({ ...fund, recent_activity: recentActivity });
});

// POST /api/funds — create new earmarked fund
router.post('/', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { name, description, target_amount, is_restricted } = req.body;
    const [{ id }] = await db('funds').insert({
      name, description, target_amount, is_restricted: is_restricted || false,
      current_balance: 0, tenant_id: req.tenantId,
    }).returning('id');

    await logAudit({
      entityType: 'fund', entityId: id, action: 'create',
      newValues: { name, description, target_amount, is_restricted },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    const fund = await db('funds').where({ id }).first();
    res.status(201).json(fund);
  } catch (err) {
    console.error('Create fund error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/funds/:id — update fund details
router.put('/:id', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const existing = await db('funds').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Fund not found' });

    const updates = {};
    ['name', 'description', 'target_amount', 'is_restricted', 'is_active'].forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    await db('funds').where({ id: req.params.id }).update(updates);

    await logAudit({
      entityType: 'fund', entityId: existing.id, action: 'update',
      oldValues: existing, newValues: updates,
      changeReason: req.body.change_reason,
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    const updated = await db('funds').where({ id: req.params.id }).first();
    res.json(updated);
  } catch (err) {
    console.error('Update fund error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/funds/:id/transfer — transfer between funds
router.post('/:id/transfer', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { to_fund_id, amount, description } = req.body;
    const fromFund = await db('funds').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    const toFund = await db('funds').where({ id: to_fund_id, tenant_id: req.tenantId }).first();
    if (!fromFund || !toFund) return res.status(404).json({ error: 'Fund not found' });
    if (fromFund.current_balance < amount) return res.status(400).json({ error: 'Insufficient fund balance' });

    const date = new Date().toISOString().slice(0, 10);

    // Debit from source
    await db('fund_transactions').insert({
      fund_id: fromFund.id, type: 'transfer_out', amount, date,
      description: description || `Transfer to ${toFund.name}`,
      created_by: req.user.id,
    });
    await db('funds').where({ id: fromFund.id }).decrement('current_balance', amount);

    // Credit to destination
    await db('fund_transactions').insert({
      fund_id: toFund.id, type: 'transfer_in', amount, date,
      description: description || `Transfer from ${fromFund.name}`,
      created_by: req.user.id,
    });
    await db('funds').where({ id: toFund.id }).increment('current_balance', amount);

    await logAudit({
      entityType: 'fund', entityId: fromFund.id, action: 'transfer',
      newValues: { from_fund: fromFund.name, to_fund: toFund.name, amount },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.json({ message: 'Transfer completed', from: fromFund.name, to: toFund.name, amount });
  } catch (err) {
    console.error('Fund transfer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/funds/:id/adjust — one-sided balance adjustment (add/remove from "nothing")
router.post('/:id/adjust', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { amount, description, type } = req.body;
    // type: 'increase' or 'decrease'
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be positive' });
    if (!['increase', 'decrease'].includes(type)) return res.status(400).json({ error: 'Type must be increase or decrease' });

    const fund = await db('funds').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    if (!fund) return res.status(404).json({ error: 'Fund not found' });

    if (type === 'decrease' && fund.current_balance < amount) {
      return res.status(400).json({ error: 'Insufficient fund balance' });
    }

    const date = new Date().toISOString().slice(0, 10);
    const fundTxnType = type === 'increase' ? 'adjustment_in' : 'adjustment_out';

    await db('fund_transactions').insert({
      fund_id: fund.id, type: fundTxnType, amount, date,
      description: description || `Balance adjustment (${type})`,
      created_by: req.user.id,
    });

    if (type === 'increase') {
      await db('funds').where({ id: fund.id }).increment('current_balance', amount);
    } else {
      await db('funds').where({ id: fund.id }).decrement('current_balance', amount);
    }

    await logAudit({
      entityType: 'fund', entityId: fund.id, action: 'adjust',
      oldValues: { current_balance: fund.current_balance },
      newValues: { adjustment: type, amount, description },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    const updated = await db('funds').where({ id: fund.id }).first();
    res.json({ message: `Fund ${type}d by ${amount}`, fund: updated });
  } catch (err) {
    console.error('Fund adjustment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/funds/:id/history — full transaction history for a fund
router.get('/:id/history', authenticate, requireTenant, async (req, res) => {
  // Verify this fund belongs to the tenant
  const fund = await db('funds').where({ id: req.params.id, tenant_id: req.tenantId }).first();
  if (!fund) return res.status(404).json({ error: 'Fund not found' });
  const history = await db('fund_transactions')
    .where({ fund_id: req.params.id })
    .orderBy('date', 'desc');
  res.json(history);
});

// ── Recurring Transfers ───────────────────────────────────

// GET /api/funds/recurring — list all recurring transfers for this tenant
router.get('/recurring/list', authenticate, requireTenant, async (req, res) => {
  try {
    const transfers = await db('recurring_transfers')
      .leftJoin('funds as from_fund', 'recurring_transfers.from_fund_id', 'from_fund.id')
      .leftJoin('funds as to_fund', 'recurring_transfers.to_fund_id', 'to_fund.id')
      .where('recurring_transfers.tenant_id', req.tenantId)
      .select(
        'recurring_transfers.*',
        'from_fund.name as from_fund_name',
        'to_fund.name as to_fund_name'
      )
      .orderBy('recurring_transfers.created_at', 'desc');
    res.json(transfers);
  } catch (err) {
    console.error('List recurring transfers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/funds/recurring — create a recurring transfer
router.post('/recurring', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { from_fund_id, to_fund_id, amount, description, frequency, day_of_month, day_of_week } = req.body;
    if (!from_fund_id || !to_fund_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'from_fund_id, to_fund_id, and positive amount are required' });
    }
    if (from_fund_id === to_fund_id) return res.status(400).json({ error: 'Cannot transfer to the same fund' });

    const fromFund = await db('funds').where({ id: from_fund_id, tenant_id: req.tenantId }).first();
    const toFund = await db('funds').where({ id: to_fund_id, tenant_id: req.tenantId }).first();
    if (!fromFund || !toFund) return res.status(404).json({ error: 'Fund not found' });

    const freq = frequency || 'monthly';
    // Calculate next run date
    const now = new Date();
    let nextRun;
    if (freq === 'monthly') {
      const dom = Math.min(Math.max(day_of_month || 1, 1), 28);
      nextRun = new Date(now.getFullYear(), now.getMonth(), dom);
      if (nextRun <= now) nextRun.setMonth(nextRun.getMonth() + 1);
    } else {
      // weekly
      const dow = day_of_week != null ? day_of_week : 1; // default Monday
      nextRun = new Date(now);
      nextRun.setDate(now.getDate() + ((7 + dow - now.getDay()) % 7 || 7));
    }

    const [{ id }] = await db('recurring_transfers').insert({
      from_fund_id, to_fund_id, amount, description,
      frequency: freq,
      day_of_month: freq === 'monthly' ? (day_of_month || 1) : null,
      day_of_week: freq === 'weekly' ? (day_of_week != null ? day_of_week : 1) : null,
      next_run_date: nextRun.toISOString().slice(0, 10),
      tenant_id: req.tenantId,
      created_by: req.user.id,
    }).returning('id');

    await logAudit({
      entityType: 'recurring_transfer', entityId: id, action: 'create',
      newValues: { from_fund: fromFund.name, to_fund: toFund.name, amount, frequency: freq },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    const created = await db('recurring_transfers').where({ id }).first();
    res.status(201).json(created);
  } catch (err) {
    console.error('Create recurring transfer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/funds/recurring/:id — deactivate a recurring transfer
router.delete('/recurring/:id', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const rt = await db('recurring_transfers').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    if (!rt) return res.status(404).json({ error: 'Recurring transfer not found' });

    await db('recurring_transfers').where({ id: req.params.id }).update({ is_active: false });

    await logAudit({
      entityType: 'recurring_transfer', entityId: rt.id, action: 'deactivate',
      oldValues: rt,
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.json({ message: 'Recurring transfer deactivated' });
  } catch (err) {
    console.error('Delete recurring transfer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
