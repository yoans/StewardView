const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logAudit } = require('../models/auditLog');
const { sendMfaCode, sendPasswordResetEmail, sendUserInviteEmail } = require('../services/email');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('JWT_SECRET must be set in production'); })()
  : 'dev-secret');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const MFA_CODE_EXPIRY_MINUTES = 10;
const PASSWORD_RESET_EXPIRY_MINUTES = 30;
const INVITE_EXPIRY_DAYS = 7;
const MIN_ADMINS = 2;

// ── Helper: count active admins within a tenant ──────────
async function countActiveAdmins(tenantId) {
  const query = db('users').where({ role: 'admin', is_active: true, is_approved: true }).whereNull('deleted_at');
  if (tenantId) query.where({ tenant_id: tenantId });
  const result = await query.count('* as count').first();
  return parseInt(result.count) || 0;
}

// ── MFA helpers ─────────────────────────────────────────
function generateMfaCode() {
  return crypto.randomInt(100000, 999999).toString();
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildPasswordResetUrl(token) {
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const baseUrl = appUrl.endsWith('/app') ? appUrl : `${appUrl}/app`;
  return `${baseUrl}/login?reset_token=${encodeURIComponent(token)}`;
}

function buildInviteSetupUrl(token) {
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const baseUrl = appUrl.endsWith('/app') ? appUrl : `${appUrl}/app`;
  return `${baseUrl}/login?invite_token=${encodeURIComponent(token)}`;
}

async function createInviteToken(userId) {
  await db('user_invite_tokens').where({ user_id: userId, used: false }).update({ used: true });
  const token = crypto.randomBytes(32).toString('hex');
  await db('user_invite_tokens').insert({
    user_id: userId,
    token_hash: hashResetToken(token),
    expires_at: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  });
  return token;
}

// POST /api/auth/login — validates credentials, sends MFA code via email
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await db('users').where({ email }).whereNull('deleted_at').first();
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.must_set_password) return res.status(403).json({ error: 'Use your setup link to choose a password before signing in.' });
    if (!user.is_approved) return res.status(403).json({ error: 'Your account is pending admin approval.' });
    if (!user.is_active) return res.status(403).json({ error: 'This account has been deactivated.' });

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

    const user = await db('users')
      .where({ id: decoded.id, is_active: true, is_approved: true, must_set_password: false })
      .whereNull('deleted_at')
      .first();
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
      tenantId: user.tenant_id || null,
    });

    res.json({ token, user: payload });
  } catch (err) {
    console.error('MFA verify error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/forgot-password — send a time-limited password reset link
router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const genericMessage = 'If an active account exists for that email, a reset link has been sent.';
    const user = await db('users')
      .where({ email, is_active: true, is_approved: true })
      .whereNull('deleted_at')
      .first();

    if (user) {
      await db('password_reset_tokens').where({ user_id: user.id, used: false }).update({ used: true });

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashResetToken(token);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);

      await db('password_reset_tokens').insert({
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

      await sendPasswordResetEmail(user.email, buildPasswordResetUrl(token));

      await logAudit({
        entityType: 'user', entityId: user.id, action: 'password_reset_requested',
        newValues: { email: user.email }, userName: user.name, ipAddress: req.ip,
        tenantId: user.tenant_id || null,
      });
    }

    res.json({ message: genericMessage });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Could not process password reset request' });
  }
});

// POST /api/auth/reset-password — exchange reset token for a new password
router.post('/reset-password', async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const newPassword = String(req.body.new_password || '');

    if (!token || !newPassword) return res.status(400).json({ error: 'Reset token and new password are required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const tokenHash = hashResetToken(token);
    const reset = await db('password_reset_tokens')
      .where({ token_hash: tokenHash, used: false })
      .where('expires_at', '>', new Date())
      .first();

    if (!reset) return res.status(400).json({ error: 'Reset link is invalid or expired' });

    const user = await db('users').where({ id: reset.user_id, is_active: true }).whereNull('deleted_at').first();
    if (!user) return res.status(400).json({ error: 'Reset link is invalid or expired' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db('users').where({ id: user.id }).update({ password_hash: hash, must_set_password: false });
    await db('password_reset_tokens').where({ user_id: user.id, used: false }).update({ used: true });
    await db('mfa_codes').where({ user_id: user.id, used: false }).update({ used: true });

    await logAudit({
      entityType: 'user', entityId: user.id, action: 'password_reset_completed',
      userName: user.name, ipAddress: req.ip, tenantId: user.tenant_id || null,
    });

    res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Could not reset password' });
  }
});

// POST /api/auth/accept-invite — choose first password from temporary setup link
router.post('/accept-invite', async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const newPassword = String(req.body.new_password || '');
    if (!token || !newPassword) return res.status(400).json({ error: 'Setup token and password are required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const invite = await db('user_invite_tokens')
      .where({ token_hash: hashResetToken(token), used: false })
      .where('expires_at', '>', new Date())
      .first();
    if (!invite) return res.status(400).json({ error: 'Setup link is invalid or expired' });

    const user = await db('users').where({ id: invite.user_id }).whereNull('deleted_at').first();
    if (!user) return res.status(400).json({ error: 'Setup link is invalid or expired' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db('users').where({ id: user.id }).update({ password_hash: hash, must_set_password: false });
    await db('user_invite_tokens').where({ user_id: user.id, used: false }).update({ used: true });

    await logAudit({
      entityType: 'user', entityId: user.id, action: 'invite_accepted',
      userName: user.name, ipAddress: req.ip, tenantId: user.tenant_id || null,
    });

    res.json({ message: 'Password set successfully. You can sign in now.' });
  } catch (err) {
    console.error('Accept invite error:', err);
    res.status(500).json({ error: 'Could not complete account setup' });
  }
});

// POST /api/auth/signup — disabled: public signup must create a tenant through onboarding
router.post('/signup', async (req, res) => {
  res.status(410).json({ error: 'Use church account registration to sign up.' });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const user = await db('users').where({ id: req.user.id }).select('id', 'email', 'name', 'role', 'tenant_id').first();
  let tenant = null;
  if (user?.tenant_id) {
    tenant = await db('tenants').where({ id: user.tenant_id })
      .select(
        'id', 'name', 'slug', 'status', 'plan', 'primary_color', 'accent_color', 'logo_url',
        'contact_email', 'phone', 'website', 'address_line1', 'address_line2', 'city', 'state',
        'postal_code', 'country', 'profile_image_url'
      ).first();
  }
  res.json({ ...user, tenant });
});

const TENANT_PROFILE_FIELDS = [
  'name', 'contact_email', 'phone', 'website', 'address_line1', 'address_line2',
  'city', 'state', 'postal_code', 'country', 'profile_image_url', 'logo_url',
  'primary_color', 'accent_color',
];

function selectTenantProfile() {
  return [
    'id', 'name', 'slug', 'status', 'plan', 'admin_email', 'contact_email', 'phone', 'website',
    'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country', 'profile_image_url',
    'logo_url', 'primary_color', 'accent_color', 'created_at', 'updated_at',
  ];
}

// GET /api/auth/tenant — current tenant profile for admins
router.get('/tenant', authenticate, requireTenant, authorize('admin'), async (req, res) => {
  try {
    const tenant = await db('tenants').where({ id: req.tenantId }).select(selectTenantProfile()).first();
    if (!tenant) return res.status(404).json({ error: 'Organization not found' });
    res.json(tenant);
  } catch (err) {
    console.error('Tenant profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/tenant — update current tenant profile
router.put('/tenant', authenticate, requireTenant, authorize('admin'), async (req, res) => {
  try {
    const updates = {};
    for (const field of TENANT_PROFILE_FIELDS) {
      if (req.body[field] !== undefined) updates[field] = req.body[field] || null;
    }

    if (!updates.name?.trim()) return res.status(400).json({ error: 'Organization name is required' });
    if (updates.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.contact_email)) {
      return res.status(400).json({ error: 'Contact email is invalid' });
    }
    for (const field of ['website', 'profile_image_url', 'logo_url']) {
      if (updates[field] && !/^https?:\/\//i.test(updates[field])) {
        return res.status(400).json({ error: `${field.replace(/_/g, ' ')} must start with http:// or https://` });
      }
    }

    await db('tenants').where({ id: req.tenantId }).update(updates);
    const tenant = await db('tenants').where({ id: req.tenantId }).select(selectTenantProfile()).first();

    await logAudit({
      entityType: 'tenant', entityId: req.tenantId, action: 'update_profile',
      newValues: updates, userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId,
    });

    res.json(tenant);
  } catch (err) {
    console.error('Update tenant profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/users — invite a user, scoped to same tenant, pending admin approval
router.post('/users', authenticate, requireTenant, authorize('admin'), async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { name, role } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'Email and name are required' });
    }

    const existing = await db('users').where({ email }).first();
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const [{ id }] = await db('users').insert({
      email, password_hash: hash, name, role: role || 'viewer',
      tenant_id: req.tenantId,
      is_active: true,
      is_approved: true,
      approved_at: new Date(),
      approved_by: req.user.id,
      must_set_password: true,
      invited_at: new Date(),
    }).returning('id');

    const token = await createInviteToken(id);
    await sendUserInviteEmail(email, buildInviteSetupUrl(token), req.user.name, req.tenant?.name);

    await logAudit({
      entityType: 'user', entityId: id, action: 'invite',
      newValues: { email, name, role, tenant_id: req.tenantId, is_approved: true, auto_approved: true },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId,
    });

    res.status(201).json({
      id, email, name, role: role || 'viewer',
      is_active: true, is_approved: true, must_set_password: true,
    });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/users — scoped to same tenant
router.get('/users', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  const users = await db('users')
    .where({ tenant_id: req.tenantId })
    .whereNull('deleted_at')
    .select('id', 'email', 'name', 'role', 'is_active', 'is_approved', 'must_set_password', 'invited_at', 'approved_at', 'created_at');
  res.json(users);
});

// PUT /api/auth/users/:id — admin updates user role / active status (same tenant only)
router.put('/users/:id', authenticate, requireTenant, authorize('admin'), async (req, res) => {
  try {
    const target = await db('users').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    if (!target) return res.status(404).json({ error: 'User not found' });

    const VALID_ROLES = ['admin', 'treasurer', 'viewer'];
    const updates = {};
    if (req.body.role !== undefined) {
      if (!VALID_ROLES.includes(req.body.role)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
      }
      updates.role = req.body.role;
    }
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active;
    if (req.body.is_approved !== undefined) {
      updates.is_approved = Boolean(req.body.is_approved);
      updates.is_active = Boolean(req.body.is_approved);
      updates.approved_at = Boolean(req.body.is_approved) ? new Date() : null;
      updates.approved_by = Boolean(req.body.is_approved) ? req.user.id : null;
    }
    if (req.body.name !== undefined) updates.name = req.body.name;

    // Enforce minimum 2 admins rule
    if (target.role === 'admin' && (updates.role && updates.role !== 'admin' || updates.is_active === false)) {
      const adminCount = await countActiveAdmins(req.tenantId);
      if (adminCount <= MIN_ADMINS) {
        return res.status(400).json({
          error: `Cannot remove admin role. System requires at least ${MIN_ADMINS} active admins. Current: ${adminCount}.`,
        });
      }
    }

    await db('users').where({ id: req.params.id }).update(updates);

    await logAudit({
      entityType: 'user', entityId: target.id, action: 'update',
      oldValues: { role: target.role, is_active: target.is_active, is_approved: target.is_approved },
      newValues: updates,
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId,
    });

    const updated = await db('users').where({ id: req.params.id })
      .select('id', 'email', 'name', 'role', 'is_active', 'is_approved', 'must_set_password', 'invited_at', 'approved_at').first();
    res.json(updated);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/users/:id/resend-invite — send a fresh setup link
router.post('/users/:id/resend-invite', authenticate, requireTenant, authorize('admin'), async (req, res) => {
  try {
    const target = await db('users').where({ id: req.params.id, tenant_id: req.tenantId }).whereNull('deleted_at').first();
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!target.must_set_password) return res.status(400).json({ error: 'This user has already set a password' });

    const token = await createInviteToken(target.id);
    await sendUserInviteEmail(target.email, buildInviteSetupUrl(token), req.user.name, req.tenant?.name);

    await logAudit({
      entityType: 'user', entityId: target.id, action: 'resend_invite',
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip, tenantId: req.tenantId,
    });

    res.json({ message: 'Setup link sent' });
  } catch (err) {
    console.error('Resend invite error:', err);
    res.status(500).json({ error: 'Could not send setup link' });
  }
});

// DELETE /api/auth/users/:id — deactivate user (soft delete, same tenant only)
router.delete('/users/:id', authenticate, requireTenant, authorize('admin'), async (req, res) => {
  try {
    const target = await db('users').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Can't deactivate yourself
    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    // Enforce minimum 2 admins rule
    if (target.role === 'admin') {
      const adminCount = await countActiveAdmins(req.tenantId);
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
      tenantId: req.tenantId,
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
      tenantId: req.user.tenant_id || null,
    });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/auth/me — soft-delete current account
router.delete('/me', authenticate, async (req, res) => {
  try {
    const user = await db('users').where({ id: req.user.id }).whereNull('deleted_at').first();
    if (!user) return res.status(404).json({ error: 'Account not found' });

    if (user.role === 'admin' && user.tenant_id) {
      const adminCount = await countActiveAdmins(user.tenant_id);
      if (adminCount <= MIN_ADMINS) {
        return res.status(400).json({
          error: `Cannot delete this admin account. System requires at least ${MIN_ADMINS} active admins.`,
        });
      }
    }

    await db('users').where({ id: user.id }).update({
      is_active: false,
      is_approved: false,
      deleted_at: new Date(),
    });
    await db('mfa_codes').where({ user_id: user.id, used: false }).update({ used: true });
    await db('password_reset_tokens').where({ user_id: user.id, used: false }).update({ used: true });
    await db('user_invite_tokens').where({ user_id: user.id, used: false }).update({ used: true });

    await logAudit({
      entityType: 'user', entityId: user.id, action: 'delete_self',
      oldValues: { is_active: user.is_active, is_approved: user.is_approved },
      newValues: { is_active: false, is_approved: false, deleted_at: true },
      userId: user.id, userName: user.name, ipAddress: req.ip, tenantId: user.tenant_id || null,
    });

    res.json({ message: 'Your account has been deleted.' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Could not delete account' });
  }
});

module.exports = router;
