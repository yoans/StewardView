const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logAudit } = require('../models/auditLog');
const { sendMfaCode } = require('../services/email');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('JWT_SECRET must be set in production'); })()
  : 'dev-secret');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const MFA_CODE_EXPIRY_MINUTES = 10;
const MIN_ADMINS = 2;

// ── Helper: count active admins within a tenant ──────────
async function countActiveAdmins(tenantId) {
  const query = db('users').where({ role: 'admin', is_active: true });
  if (tenantId) query.where({ tenant_id: tenantId });
  const result = await query.count('* as count').first();
  return parseInt(result.count) || 0;
}

// ── MFA helpers ─────────────────────────────────────────
function generateMfaCode() {
  return crypto.randomInt(100000, 999999).toString();
}

// POST /api/auth/login — validates credentials, sends MFA code via email
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await db('users').where({ email, is_active: true }).first();
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Invalidate any existing unused codes for this user
    await db('mfa_codes').where({ user_id: user.id, used: false }).update({ used: true });

    // Generate and store MFA code
    const code = generateMfaCode();
    const expiresAt = new Date(Date.now() + MFA_CODE_EXPIRY_MINUTES * 60 * 1000);
    await db('mfa_codes').insert({ user_id: user.id, code, expires_at: expiresAt });

    // Send code via email
    await sendMfaCode(user.email, code);

    // Return a short-lived MFA token (not a session token — only good for /verify-mfa)
    const mfaToken = jwt.sign(
      { id: user.id, purpose: 'mfa' },
      JWT_SECRET,
      { expiresIn: `${MFA_CODE_EXPIRY_MINUTES}m` },
    );

    res.json({ mfa_required: true, mfa_token: mfaToken });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/verify-mfa — exchange MFA token + code for a real session token
router.post('/verify-mfa', async (req, res) => {
  try {
    const { mfa_token, code } = req.body;
    if (!mfa_token || !code) return res.status(400).json({ error: 'MFA token and code are required' });

    let decoded;
    try {
      decoded = jwt.verify(mfa_token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'MFA session expired. Please log in again.' });
    }
    if (decoded.purpose !== 'mfa') return res.status(401).json({ error: 'Invalid token' });

    const record = await db('mfa_codes')
      .where({ user_id: decoded.id, code: code.trim(), used: false })
      .where('expires_at', '>', new Date())
      .first();

    if (!record) return res.status(401).json({ error: 'Invalid or expired code' });

    // Mark code as used
    await db('mfa_codes').where({ id: record.id }).update({ used: true });

    const user = await db('users').where({ id: decoded.id, is_active: true }).first();
    if (!user) return res.status(401).json({ error: 'Account not found' });

    const payload = {
      id: user.id, email: user.email, name: user.name, role: user.role,
      tenant_id: user.tenant_id || null,
      is_platform_admin: user.is_platform_admin || false,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    await logAudit({
      entityType: 'user', entityId: user.id, action: 'login',
      newValues: { email: user.email, mfa: true }, userName: user.name,
      ipAddress: req.ip,
    });

    res.json({ token, user: payload });
  } catch (err) {
    console.error('MFA verify error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/signup — self-registration (creates viewer account, admin can upgrade later)
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await db('users').where({ email }).first();
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    // For self-registration within an existing tenant, tenant_id can be passed in the request.
    // This is used by admins inviting new users to their tenant.
    const tenantId = req.body.tenant_id || null;
    const [{ id }] = await db('users').insert({
      email, password_hash: hash, name, role: 'viewer', is_active: true,
      tenant_id: tenantId,
    }).returning('id');

    await logAudit({
      entityType: 'user', entityId: id, action: 'signup',
      newValues: { email, name, role: 'viewer', tenant_id: tenantId },
      ipAddress: req.ip,
    });

    const payload = { id, email, name, role: 'viewer', tenant_id: tenantId };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.status(201).json({ token, user: payload });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const user = await db('users').where({ id: req.user.id }).select('id', 'email', 'name', 'role', 'tenant_id').first();
  let tenant = null;
  if (user?.tenant_id) {
    tenant = await db('tenants').where({ id: user.tenant_id })
      .select('id', 'name', 'slug', 'status', 'plan', 'primary_color', 'accent_color', 'logo_url').first();
  }
  res.json({ ...user, tenant });
});

// POST /api/auth/users  (admin/treasurer only — create user with any role, scoped to same tenant)
router.post('/users', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const existing = await db('users').where({ email }).first();
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const [{ id }] = await db('users').insert({
      email, password_hash: hash, name, role: role || 'viewer',
      tenant_id: req.tenantId,
    }).returning('id');

    await logAudit({
      entityType: 'user', entityId: id, action: 'create',
      newValues: { email, name, role, tenant_id: req.tenantId },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.status(201).json({ id, email, name, role: role || 'viewer' });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/users — scoped to same tenant
router.get('/users', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  const users = await db('users')
    .where({ tenant_id: req.tenantId })
    .select('id', 'email', 'name', 'role', 'is_active', 'created_at');
  res.json(users);
});

// PUT /api/auth/users/:id — admin updates user role / active status
router.put('/users/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const target = await db('users').where({ id: req.params.id }).first();
    if (!target) return res.status(404).json({ error: 'User not found' });

    const updates = {};
    if (req.body.role !== undefined) updates.role = req.body.role;
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active;
    if (req.body.name !== undefined) updates.name = req.body.name;

    // Enforce minimum 2 admins rule
    if (target.role === 'admin' && (updates.role && updates.role !== 'admin' || updates.is_active === false)) {
      const adminCount = await countActiveAdmins(req.user.tenant_id);
      if (adminCount <= MIN_ADMINS) {
        return res.status(400).json({
          error: `Cannot remove admin role. System requires at least ${MIN_ADMINS} active admins. Current: ${adminCount}.`,
        });
      }
    }

    await db('users').where({ id: req.params.id }).update(updates);

    await logAudit({
      entityType: 'user', entityId: target.id, action: 'update',
      oldValues: { role: target.role, is_active: target.is_active },
      newValues: updates,
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    const updated = await db('users').where({ id: req.params.id })
      .select('id', 'email', 'name', 'role', 'is_active').first();
    res.json(updated);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/auth/users/:id — deactivate user (soft delete)
router.delete('/users/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const target = await db('users').where({ id: req.params.id }).first();
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Can't deactivate yourself
    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    // Enforce minimum 2 admins rule
    if (target.role === 'admin') {
      const adminCount = await countActiveAdmins(req.user.tenant_id);
      if (adminCount <= MIN_ADMINS) {
        return res.status(400).json({
          error: `Cannot deactivate admin. System requires at least ${MIN_ADMINS} active admins.`,
        });
      }
    }

    await db('users').where({ id: req.params.id }).update({ is_active: false });

    await logAudit({
      entityType: 'user', entityId: target.id, action: 'deactivate',
      oldValues: { is_active: true },
      newValues: { is_active: false },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.json({ message: 'User deactivated', id: target.id });
  } catch (err) {
    console.error('Deactivate user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = await db('users').where({ id: req.user.id }).first();
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 10);
    await db('users').where({ id: req.user.id }).update({ password_hash: hash });

    await logAudit({
      entityType: 'user', entityId: req.user.id, action: 'change_password',
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
