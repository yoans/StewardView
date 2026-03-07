const router = require('express').Router();
const db = require('../models/db');
const { authenticate } = require('../middleware/auth');

// GET /api/categories
router.get('/', authenticate, async (req, res) => {
  const { type } = req.query;
  let query = db('categories').where({ is_active: true }).orderBy('type', 'name');
  if (type) query = query.where({ type });
  res.json(await query);
});

module.exports = router;
