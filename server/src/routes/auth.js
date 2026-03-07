const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../models/auditLog');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await db('users').where({ email, is_active: true }).first();
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    await logAudit({
      entityType: 'user', entityId: user.id, action: 'login',
      newValues: { email: user.email }, userName: user.name,
      ipAddress: req.ip,
    });

    res.json({ token, user: payload });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const user = await db('users').where({ id: req.user.id }).select('id', 'email', 'name', 'role').first();
  res.json(user);
});

// POST /api/auth/users  (admin/treasurer only)
router.post('/users', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const [id] = await db('users').insert({ email, password_hash: hash, name, role: role || 'viewer' });

    await logAudit({
      entityType: 'user', entityId: id, action: 'create',
      newValues: { email, name, role }, userId: req.user.id,
      userName: req.user.name, ipAddress: req.ip,
    });

    res.status(201).json({ id, email, name, role });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/users
router.get('/users', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const users = await db('users').select('id', 'email', 'name', 'role', 'is_active', 'created_at');
  res.json(users);
});

module.exports = router;
