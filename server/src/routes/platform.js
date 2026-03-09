/**
 * Platform Admin API — manage all church tenants.
 * Protected by PLATFORM_ADMIN_SECRET env var or is_platform_admin JWT flag.
 */
const router = require('express').Router();
const db = require('../models/db');
const { authenticate } = require('../middleware/auth');
const { requirePlatformAdmin } = require('../middleware/tenant');

const guard = [authenticate, requirePlatformAdmin];

// GET /api/platform/tenants — list all tenants
router.get('/tenants', guard, async (req, res) => {
  try {
    const tenants = await db('tenants').orderBy('created_at', 'desc');
    // Attach user count per tenant
    const counts = await db('users')
      .groupBy('tenant_id')
      .select('tenant_id')
      .count('* as user_count');
    const countMap = Object.fromEntries(counts.map(c => [c.tenant_id, parseInt(c.user_count)]));

    res.json(tenants.map(t => ({ ...t, user_count: countMap[t.id] || 0 })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/platform/tenants/:id — single tenant detail
router.get('/tenants/:id', guard, async (req, res) => {
  try {
    const tenant = await db('tenants').where({ id: req.params.id }).first();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const users = await db('users').where({ tenant_id: tenant.id }).select('id', 'name', 'email', 'role', 'is_active', 'created_at');
    const txnCount = await db('transactions').where({ tenant_id: tenant.id }).count('* as c').first();
    const bankAccts = await db('bank_accounts').where({ tenant_id: tenant.id, is_active: true }).select('name', 'institution', 'current_balance');

    res.json({ ...tenant, users, transaction_count: parseInt(txnCount?.c || 0), bank_accounts: bankAccts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/platform/tenants/:id — update tenant (status, plan, notes, branding)
router.put('/tenants/:id', guard, async (req, res) => {
  try {
    const { status, plan, plan_amount, primary_color, accent_color, logo_url, notes, name } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (status !== undefined) {
      updates.status = status;
      if (status === 'suspended') updates.suspended_at = new Date().toISOString();
    }
    if (plan !== undefined) updates.plan = plan;
    if (plan_amount !== undefined) updates.plan_amount = plan_amount;
    if (primary_color !== undefined) updates.primary_color = primary_color;
    if (accent_color !== undefined) updates.accent_color = accent_color;
    if (logo_url !== undefined) updates.logo_url = logo_url;
    if (notes !== undefined) updates.notes = notes;

    await db('tenants').where({ id: req.params.id }).update(updates);
    const updated = await db('tenants').where({ id: req.params.id }).first();
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/platform/tenants/:id/suspend — suspend a tenant
router.post('/tenants/:id/suspend', guard, async (req, res) => {
  try {
    const { reason } = req.body;
    await db('tenants').where({ id: req.params.id }).update({
      status: 'suspended',
      suspended_at: new Date().toISOString(),
      notes: reason ? `Suspended: ${reason}` : 'Suspended by platform admin',
    });
    res.json({ message: 'Tenant suspended. Data preserved.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/platform/tenants/:id/reactivate — reactivate a suspended tenant
router.post('/tenants/:id/reactivate', guard, async (req, res) => {
  try {
    await db('tenants').where({ id: req.params.id }).update({
      status: 'active',
      suspended_at: null,
    });
    res.json({ message: 'Tenant reactivated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/platform/stats — platform-wide stats
router.get('/stats', guard, async (req, res) => {
  try {
    const [tenantCount, activeCount, suspendedCount, freeCount,
      paidCount, totalUsers, totalTxns] = await Promise.all([
      db('tenants').count('* as c').first(),
      db('tenants').where({ status: 'active' }).count('* as c').first(),
      db('tenants').where({ status: 'suspended' }).count('* as c').first(),
      db('tenants').where({ plan: 'free' }).count('* as c').first(),
      db('tenants').whereNot({ plan: 'free' }).count('* as c').first(),
      db('users').count('* as c').first(),
      db('transactions').count('* as c').first(),
    ]);

    const mrr = await db('tenants')
      .where({ status: 'active' })
      .whereNot({ plan: 'free' })
      .sum('plan_amount as total')
      .first();

    res.json({
      total_tenants: parseInt(tenantCount?.c || 0),
      active: parseInt(activeCount?.c || 0),
      suspended: parseInt(suspendedCount?.c || 0),
      free_plan: parseInt(freeCount?.c || 0),
      paid_plan: parseInt(paidCount?.c || 0),
      total_users: parseInt(totalUsers?.c || 0),
      total_transactions: parseInt(totalTxns?.c || 0),
      mrr: parseFloat(mrr?.total || 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
