const router = require('express').Router();
const db = require('../models/db');
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { getAuditLog } = require('../models/auditLog');

// GET /api/audit — full audit log with optional filters
router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const { entity_type, user_id, start_date, end_date, limit = 100, offset = 0 } = req.query;

    const log = await getAuditLog({
      entityType: entity_type,
      userId: user_id ? parseInt(user_id) : undefined,
      startDate: start_date,
      endDate: end_date,
      limit: parseInt(limit),
      offset: parseInt(offset),
      tenantId: req.tenantId,
    });

    // Parse JSON fields for display
    const parsed = log.map(entry => ({
      ...entry,
      old_values: entry.old_values ? JSON.parse(entry.old_values) : null,
      new_values: entry.new_values ? JSON.parse(entry.new_values) : null,
    }));

    res.json(parsed);
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/audit/:entityType/:entityId — audit trail for a specific entity
router.get('/:entityType/:entityId', authenticate, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const entries = await db('audit_log')
      .where({ entity_type: entityType, entity_id: entityId })
      .orderBy('created_at', 'desc');

    const parsed = entries.map(entry => ({
      ...entry,
      old_values: entry.old_values ? JSON.parse(entry.old_values) : null,
      new_values: entry.new_values ? JSON.parse(entry.new_values) : null,
    }));

    res.json(parsed);
  } catch (err) {
    console.error('Entity audit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
