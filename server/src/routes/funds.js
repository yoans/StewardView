const router = require('express').Router();
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../models/auditLog');

// GET /api/funds — list all funds with balances
router.get('/', authenticate, async (req, res) => {
  const funds = await db('funds').where({ is_active: true }).orderBy('name');
  res.json(funds);
});

// GET /api/funds/:id — single fund with recent activity
router.get('/:id', authenticate, async (req, res) => {
  const fund = await db('funds').where({ id: req.params.id }).first();
  if (!fund) return res.status(404).json({ error: 'Fund not found' });

  const recentActivity = await db('fund_transactions')
    .where({ fund_id: req.params.id })
    .orderBy('date', 'desc')
    .limit(50);

  res.json({ ...fund, recent_activity: recentActivity });
});

// POST /api/funds — create new earmarked fund
router.post('/', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { name, description, target_amount, is_restricted } = req.body;
    const [id] = await db('funds').insert({
      name, description, target_amount, is_restricted: is_restricted || false,
      current_balance: 0,
    });

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
router.put('/:id', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
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
router.post('/:id/transfer', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { to_fund_id, amount, description } = req.body;
    const fromFund = await db('funds').where({ id: req.params.id }).first();
    const toFund = await db('funds').where({ id: to_fund_id }).first();
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

// GET /api/funds/:id/history — full transaction history for a fund
router.get('/:id/history', authenticate, async (req, res) => {
  const history = await db('fund_transactions')
    .where({ fund_id: req.params.id })
    .orderBy('date', 'desc');
  res.json(history);
});

module.exports = router;
