const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logAudit } = require('../models/auditLog');

// ── Givelify Envelope → Fund mapping rules ──────────────
// Admin can configure these via the settings endpoint; defaults below.
const DEFAULT_ENVELOPE_MAP = {
  'tithe': 'General Fund',
  'tithes': 'General Fund',
  'offering': 'General Fund',
  'general': 'General Fund',
  'missions': 'Missions Fund',
  'mission': 'Missions Fund',
  'building': 'Building Fund',
  'building fund': 'Building Fund',
  'benevolence': 'Benevolence Fund',
  'youth': 'Youth Fund',
  'youth ministry': 'Youth Fund',
};

async function getEnvelopeMap(tenantId) {
  try {
    const setting = await db('app_settings').where({ key: 'givelify_envelope_map', tenant_id: tenantId }).first();
    if (setting && setting.value) return JSON.parse(setting.value);
  } catch { /* ignore */ }
  return DEFAULT_ENVELOPE_MAP;
}

async function mapEnvelopeToFund(envelope, tenantId) {
  const map = await getEnvelopeMap(tenantId);
  const normalized = (envelope || '').toLowerCase().trim();
  const fundName = map[normalized];
  if (!fundName) return null;
  return db('funds').where({ name: fundName, is_active: true, tenant_id: tenantId }).first();
}

// GET /api/givelify — list imported contributions
router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const { status, start_date, end_date, limit = 100, offset = 0 } = req.query;
    let query = db('givelify_contributions')
      .leftJoin('funds', 'givelify_contributions.fund_id', 'funds.id')
      .select('givelify_contributions.*', 'funds.name as fund_name')
      .where('givelify_contributions.tenant_id', req.tenantId)
      .orderBy('givelify_contributions.date', 'desc')
      .limit(parseInt(limit))
      .offset(parseInt(offset));
    if (status) query = query.where('givelify_contributions.status', status);
    if (start_date) query = query.where('givelify_contributions.date', '>=', start_date);
    if (end_date) query = query.where('givelify_contributions.date', '<=', end_date);
    const rows = await query;
    res.json(rows);
  } catch (err) {
    console.error('Givelify list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/givelify/summary — dashboard stats
router.get('/summary', authenticate, requireTenant, async (req, res) => {
  try {
    const thisMonth = new Date().toISOString().slice(0, 7);
    const startDate = `${thisMonth}-01`;
    const total = await db('givelify_contributions')
      .where('status', '!=', 'void').where('tenant_id', req.tenantId)
      .sum('amount as total').first();
    const monthTotal = await db('givelify_contributions')
      .where('status', '!=', 'void').where('tenant_id', req.tenantId)
      .where('date', '>=', startDate)
      .sum('amount as total').first();
    const pending = await db('givelify_contributions')
      .where({ status: 'pending', tenant_id: req.tenantId }).count('* as count').first();
    res.json({
      total_all_time: parseFloat(total.total) || 0,
      total_this_month: parseFloat(monthTotal.total) || 0,
      pending_count: parseInt(pending.count) || 0,
    });
  } catch (err) {
    console.error('Givelify summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/givelify/import — import from CSV data (array of objects)
router.post('/import', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { contributions } = req.body; // array of { donor_name, donor_email, amount, date, envelope, givelify_id }
    if (!Array.isArray(contributions) || contributions.length === 0) {
      return res.status(400).json({ error: 'contributions array is required' });
    }

    const results = { imported: 0, skipped: 0, auto_earmarked: 0, errors: [] };

    for (const c of contributions) {
      try {
        // Skip duplicates
        if (c.givelify_id) {
          const existing = await db('givelify_contributions').where({ givelify_id: c.givelify_id, tenant_id: req.tenantId }).first();
          if (existing) { results.skipped++; continue; }
        }

        // Auto-map envelope to fund
        const fund = await mapEnvelopeToFund(c.envelope, req.tenantId);

        const [{ id: gcId }] = await db('givelify_contributions').insert({
          givelify_id: c.givelify_id || null,
          donor_name: c.donor_name || 'Anonymous',
          donor_email: c.donor_email || null,
          amount: parseFloat(c.amount),
          date: c.date,
          envelope: c.envelope || 'General',
          fund_mapping: fund ? fund.name : null,
          fund_id: fund ? fund.id : null,
          status: 'pending',
          raw_data: JSON.stringify(c),
          tenant_id: req.tenantId,
        }).returning('id');

        // Auto-create transaction and earmark to fund
        if (fund) {
          const ref_number = uuidv4();
          let categoryId = null;
          if (fund.name === 'General Fund') {
            const cat = await db('categories').where({ name: 'Tithes & Offerings', type: 'income', tenant_id: req.tenantId }).first();
            categoryId = cat ? cat.id : null;
          } else {
            const cat = await db('categories').where({ name: 'Directed Contributions', type: 'income', tenant_id: req.tenantId }).first();
            categoryId = cat ? cat.id : null;
          }

          const [{ id: txnId }] = await db('transactions').insert({
            ref_number,
            type: 'income',
            amount: parseFloat(c.amount),
            date: c.date,
            description: `Givelify - ${c.envelope || 'General'} (${c.donor_name || 'Anonymous'})`,
            payee_payer: c.donor_name || 'Givelify',
            category_id: categoryId,
            bank_account_id: 1, // default checking
            fund_id: fund.id,
            status: 'cleared',
            notes: `Auto-imported from Givelify. ID: ${c.givelify_id || 'N/A'}`,
            created_by: req.user.id,
            tenant_id: req.tenantId,
          }).returning('id');

          // Create fund transaction
          await db('fund_transactions').insert({
            fund_id: fund.id,
            transaction_id: txnId,
            type: 'contribution',
            amount: parseFloat(c.amount),
            date: c.date,
            description: `Givelify: ${c.envelope || 'General'}`,
            donor_name: c.donor_name || 'Givelify',
            created_by: req.user.id,
            tenant_id: req.tenantId,
          });

          // Update fund balance
          await db('funds').where({ id: fund.id, tenant_id: req.tenantId }).increment('current_balance', parseFloat(c.amount));

          // Mark as imported
          await db('givelify_contributions').where({ id: gcId }).update({
            status: 'imported',
            transaction_id: txnId,
            fund_id: fund.id,
          });

          results.auto_earmarked++;
        }

        results.imported++;
      } catch (rowErr) {
        results.errors.push({ row: c, error: rowErr.message });
      }
    }

    await logAudit({
      entityType: 'givelify', entityId: 0, action: 'import',
      newValues: results,
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.json(results);
  } catch (err) {
    console.error('Givelify import error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/givelify/:id/earmark — manually earmark a pending Givelify contribution
router.post('/:id/earmark', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const gc = await db('givelify_contributions').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    if (!gc) return res.status(404).json({ error: 'Contribution not found' });
    if (gc.status === 'imported') return res.status(400).json({ error: 'Already imported' });

    const { fund_id } = req.body;
    const fund = await db('funds').where({ id: fund_id, tenant_id: req.tenantId }).first();
    if (!fund) return res.status(404).json({ error: 'Fund not found' });

    const ref_number = uuidv4();
    let categoryId = null;
    if (fund.name === 'General Fund') {
      const cat = await db('categories').where({ name: 'Tithes & Offerings', type: 'income', tenant_id: req.tenantId }).first();
      categoryId = cat ? cat.id : null;
    } else {
      const cat = await db('categories').where({ name: 'Directed Contributions', type: 'income', tenant_id: req.tenantId }).first();
      categoryId = cat ? cat.id : null;
    }

    const [{ id: txnId }] = await db('transactions').insert({
      ref_number,
      type: 'income',
      amount: gc.amount,
      date: gc.date,
      description: `Givelify - ${gc.envelope || 'General'} (${gc.donor_name})`,
      payee_payer: gc.donor_name || 'Givelify',
      category_id: categoryId,
      bank_account_id: 1,
      fund_id: fund.id,
      status: 'cleared',
      notes: `Manually earmarked from Givelify. ID: ${gc.givelify_id || 'N/A'}`,
      created_by: req.user.id,
      tenant_id: req.tenantId,
    }).returning('id');

    await db('fund_transactions').insert({
      fund_id: fund.id, transaction_id: txnId,
      type: 'contribution', amount: gc.amount, date: gc.date,
      description: `Givelify: ${gc.envelope || 'General'}`,
      donor_name: gc.donor_name, created_by: req.user.id,
      tenant_id: req.tenantId,
    });

    await db('funds').where({ id: fund.id, tenant_id: req.tenantId }).increment('current_balance', parseFloat(gc.amount));

    await db('givelify_contributions').where({ id: gc.id }).update({
      status: 'imported', transaction_id: txnId, fund_id: fund.id, fund_mapping: fund.name,
    });

    await logAudit({
      entityType: 'givelify', entityId: gc.id, action: 'earmark',
      newValues: { fund_id, fund_name: fund.name, amount: gc.amount },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.json({ message: 'Contribution earmarked and imported', transaction_id: txnId });
  } catch (err) {
    console.error('Givelify earmark error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/givelify/envelope-map — get current envelope→fund mapping
router.get('/envelope-map', authenticate, requireTenant, async (req, res) => {
  const map = await getEnvelopeMap(req.tenantId);
  res.json(map);
});

// PUT /api/givelify/envelope-map — update envelope→fund mapping
router.put('/envelope-map', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { map } = req.body;
    const existing = await db('app_settings').where({ key: 'givelify_envelope_map', tenant_id: req.tenantId }).first();
    if (existing) {
      await db('app_settings').where({ key: 'givelify_envelope_map', tenant_id: req.tenantId }).update({ value: JSON.stringify(map) });
    } else {
      await db('app_settings').insert({ key: 'givelify_envelope_map', value: JSON.stringify(map), tenant_id: req.tenantId });
    }
    await logAudit({
      entityType: 'settings', entityId: 0, action: 'update',
      newValues: { givelify_envelope_map: map },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });
    res.json({ message: 'Envelope mapping updated', map });
  } catch (err) {
    console.error('Update envelope map error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
