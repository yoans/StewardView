const router = require('express').Router();
const db = require('../models/db');
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');

// GET /api/categories
router.get('/', authenticate, requireTenant, async (req, res) => {
  const { type } = req.query;
  let query = db('categories').where({ is_active: true, tenant_id: req.tenantId }).orderBy(['type', 'name']);
  if (type) query = query.where({ type });
  res.json(await query);
});

module.exports = router;
