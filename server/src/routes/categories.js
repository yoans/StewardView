const router = require('express').Router();
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logAudit } = require('../models/auditLog');
const { CHURCH_CATEGORIES } = require('../utils/defaultCategories');
const { loadTransferCoverage } = require('../utils/budgetReport');
const { applyCategoryRules } = require('../services/applyCategoryRules');
const { rulesForTenant, buildRuleRows } = require('../services/categoryRules');

function orderCategories(query) {
  return query.orderBy([
    { column: 'sort_order', order: 'asc' },
    { column: 'type', order: 'asc' },
    { column: 'name', order: 'asc' },
  ]);
}

// GET /api/categories
router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const { type, include_inactive } = req.query;
    let query = db('categories').where({ tenant_id: req.tenantId });
    if (include_inactive !== '1' && include_inactive !== 'true') {
      query = query.where({ is_active: true });
    }
    if (type) query = query.where({ type });
    const rows = await orderCategories(query);
    const coverage = await loadTransferCoverage(req.tenantId);
    res.json(rows.map((row) => {
      const cover = coverage.get(Number(row.id));
      return {
        ...row,
        covered_by_transfer: Boolean(cover),
        transfer_amount: cover ? cover.amount : null,
        transfer_fund: cover ? cover.fund_name : null,
      };
    }));
  } catch (err) {
    console.error('Categories list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/categories
router.post('/', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const type = req.body.type;
    const description = req.body.description ? String(req.body.description).trim() : null;
    const sort_order = parseInt(req.body.sort_order) || 0;

    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'Type must be income or expense' });
    }

    const dup = await db('categories')
      .where({ tenant_id: req.tenantId })
      .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
      .first();
    if (dup) {
      if (!dup.is_active) {
        const [{ id }] = await db('categories').where({ id: dup.id }).update({
          name,
          type,
          description,
          sort_order,
          is_active: true,
          updated_at: new Date().toISOString(),
        }).returning('id');
        const row = await db('categories').where({ id }).first();
        await logAudit({
          entityType: 'category', entityId: id, action: 'reactivate',
          newValues: { name, type, description, sort_order },
          userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
          tenantId: req.tenantId,
        });
        return res.status(201).json(row);
      }
      return res.status(400).json({ error: 'A category with that name already exists' });
    }

    const [{ id }] = await db('categories').insert({
      name,
      type,
      description,
      sort_order,
      is_active: true,
      tenant_id: req.tenantId,
    }).returning('id');

    const row = await db('categories').where({ id }).first();
    await logAudit({
      entityType: 'category', entityId: id, action: 'create',
      newValues: { name, type, description, sort_order },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId,
    });
    res.status(201).json(row);
  } catch (err) {
    console.error('Category create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/categories/ensure-defaults — add any missing church workbook categories
router.post('/ensure-defaults', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const existing = await db('categories').where({ tenant_id: req.tenantId });
    const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));
    let added = 0;
    let reactivated = 0;

    for (const def of CHURCH_CATEGORIES) {
      const hit = byName.get(def.name.toLowerCase());
      if (!hit) {
        await db('categories').insert({
          name: def.name,
          type: def.type,
          description: def.description,
          sort_order: def.sort_order,
          group_name: def.group_name,
          is_active: true,
          tenant_id: req.tenantId,
        });
        added++;
      } else if (!hit.is_active) {
        await db('categories').where({ id: hit.id }).update({
          is_active: true,
          description: def.description,
          sort_order: def.sort_order,
          group_name: def.group_name,
          type: def.type,
          updated_at: new Date().toISOString(),
        });
        reactivated++;
      } else {
        await db('categories').where({ id: hit.id }).update({
          sort_order: def.sort_order,
          group_name: def.group_name,
          description: def.description,
          updated_at: new Date().toISOString(),
        });
      }
    }

    await logAudit({
      entityType: 'category', entityId: 0, action: 'ensure_defaults',
      newValues: { added, reactivated },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId,
    });

    const rows = await orderCategories(db('categories').where({ tenant_id: req.tenantId, is_active: true }));
    res.json({ message: 'Defaults ensured', added, reactivated, categories: rows });
  } catch (err) {
    console.error('Ensure defaults error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/rules', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const rules = await db('category_rules')
      .leftJoin('categories', 'category_rules.category_id', 'categories.id')
      .where('category_rules.tenant_id', req.tenantId)
      .select('category_rules.*', 'categories.name as category_name')
      .orderBy('category_rules.priority');
    res.json(rules);
  } catch (err) {
    console.error('List category rules error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/rules', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const pattern = String(req.body.pattern || '').trim();
    const categoryId = parseInt(req.body.category_id, 10);
    if (!pattern) return res.status(400).json({ error: 'Say what the description contains' });
    const category = await db('categories').where({ id: categoryId, tenant_id: req.tenantId, is_active: true }).first();
    if (!category) return res.status(404).json({ error: 'Category not found' });
    const [{ id }] = await db('category_rules').insert({
      tenant_id: req.tenantId,
      pattern: pattern.slice(0, 120),
      match_mode: req.body.match_mode === 'exact' ? 'exact' : 'contains',
      transaction_type: category.type,
      min_amount: req.body.min_amount === '' || req.body.min_amount == null ? null : req.body.min_amount,
      max_amount: req.body.max_amount === '' || req.body.max_amount == null ? null : req.body.max_amount,
      category_id: category.id,
      priority: 200,
      is_active: true,
    }).returning('id');
    const row = await db('category_rules').where({ id }).first();
    res.status(201).json(row);
  } catch (err) {
    console.error('Create category rule error:', err);
    res.status(500).json({ error: 'Could not save that rule' });
  }
});

router.delete('/rules/:id', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const deleted = await db('category_rules').where({ id: req.params.id, tenant_id: req.tenantId }).del();
    if (!deleted) return res.status(404).json({ error: 'Rule not found' });
    res.json({ message: 'Rule removed' });
  } catch (err) {
    console.error('Delete category rule error:', err);
    res.status(500).json({ error: 'Could not remove that rule' });
  }
});

router.post('/rules/apply', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const result = await applyCategoryRules(req.tenantId);
    res.json({ message: `Categorized ${result.updated} transaction${result.updated === 1 ? '' : 's'}`, ...result });
  } catch (err) {
    console.error('Apply category rules error:', err);
    res.status(500).json({ error: 'Could not apply the rules' });
  }
});

router.post('/rules/defaults', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const existing = await db('category_rules').where({ tenant_id: req.tenantId }).count('* as c').first();
    if ((parseInt(existing.c, 10) || 0) > 0) {
      return res.json({ message: 'Rules are already set', added: 0 });
    }
    const cats = await db('categories').where({ tenant_id: req.tenantId, is_active: true }).select('id', 'name');
    const idByName = new Map(cats.map((cat) => [cat.name.toLowerCase(), cat.id]));
    const rows = buildRuleRows(rulesForTenant(req.tenantId), req.tenantId, idByName);
    if (rows.length) await db('category_rules').insert(rows);
    res.json({ message: 'Standard rules added', added: rows.length });
  } catch (err) {
    console.error('Seed category rules error:', err);
    res.status(500).json({ error: 'Could not add the standard rules' });
  }
});

// PUT /api/categories/:id
router.put('/:id', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const existing = await db('categories').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    const updates = {};
    if (req.body.name != null) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const dup = await db('categories')
        .where({ tenant_id: req.tenantId })
        .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
        .whereNot({ id: existing.id })
        .first();
      if (dup) return res.status(400).json({ error: 'A category with that name already exists' });
      updates.name = name;
    }
    if (req.body.type != null) {
      if (!['income', 'expense'].includes(req.body.type)) {
        return res.status(400).json({ error: 'Type must be income or expense' });
      }
      updates.type = req.body.type;
    }
    if (req.body.description !== undefined) {
      updates.description = req.body.description ? String(req.body.description).trim() : null;
    }
    if (req.body.sort_order !== undefined) {
      updates.sort_order = parseInt(req.body.sort_order) || 0;
    }
    if (req.body.is_active !== undefined) {
      updates.is_active = !!req.body.is_active;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No changes provided' });
    }
    updates.updated_at = new Date().toISOString();

    await db('categories').where({ id: existing.id }).update(updates);
    const row = await db('categories').where({ id: existing.id }).first();
    await logAudit({
      entityType: 'category', entityId: existing.id, action: 'update',
      oldValues: existing, newValues: updates,
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId,
    });
    res.json(row);
  } catch (err) {
    console.error('Category update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/categories/:id — soft-deactivate (keeps history)
router.delete('/:id', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const existing = await db('categories').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    await db('categories').where({ id: existing.id }).update({
      is_active: false,
      updated_at: new Date().toISOString(),
    });
    await logAudit({
      entityType: 'category', entityId: existing.id, action: 'deactivate',
      oldValues: { name: existing.name, is_active: true },
      newValues: { is_active: false },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId,
    });
    res.json({ message: 'Category deactivated' });
  } catch (err) {
    console.error('Category delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
