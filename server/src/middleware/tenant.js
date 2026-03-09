const db = require('../models/db');

/**
 * Extracts tenant from req.user.tenant_id (set by auth middleware).
 * Loads tenant record, enforces subscription status.
 * Sets req.tenant and req.tenantId.
 */
async function requireTenant(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  // Platform admins bypass tenant checks
  if (req.user.is_platform_admin) {
    req.tenantId = req.user.tenant_id || null;
    return next();
  }

  const tenantId = req.user.tenant_id;
  if (!tenantId) return res.status(403).json({ error: 'No tenant associated with this account' });

  try {
    const tenant = await db('tenants').where({ id: tenantId }).first();
    if (!tenant) return res.status(403).json({ error: 'Tenant not found' });

    if (tenant.status === 'suspended') {
      return res.status(402).json({
        error: 'Your church account is currently suspended.',
        reason: 'subscription_suspended',
        message: 'Your subscription has been suspended. Please contact support to reactivate your account. Your data is safe and preserved.',
      });
    }

    if (tenant.status === 'canceled') {
      return res.status(402).json({
        error: 'Your church account has been canceled.',
        reason: 'subscription_canceled',
        message: 'Your account is no longer active. All your data is preserved. Contact support to reactivate.',
      });
    }

    req.tenant = tenant;
    req.tenantId = tenantId;
    next();
  } catch (err) {
    console.error('Tenant middleware error:', err);
    res.status(500).json({ error: 'Server error checking account status' });
  }
}

/**
 * Middleware for platform admin endpoints.
 * Checks PLATFORM_ADMIN_SECRET header or is_platform_admin JWT flag.
 */
function requirePlatformAdmin(req, res, next) {
  const secret = req.headers['x-platform-secret'];
  if (secret && secret === process.env.PLATFORM_ADMIN_SECRET) {
    return next();
  }
  if (req.user && req.user.is_platform_admin) {
    return next();
  }
  return res.status(403).json({ error: 'Platform admin access required' });
}

module.exports = { requireTenant, requirePlatformAdmin };
