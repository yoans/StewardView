/**
 * Onboarding & Stripe routes — church sign-up and subscription management.
 */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/db');
const { logAudit } = require('../models/auditLog');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('JWT_SECRET must be set in production'); })()
  : 'dev-secret');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// ── Stripe client (optional) ─────────────────────────────
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    return require('stripe')(process.env.STRIPE_SECRET_KEY);
  } catch { return null; }
}

// ── Helper: generate URL-safe slug from church name ──────
function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

// ── POST /api/onboarding/register — create new church tenant ──
router.post('/register', async (req, res) => {
  try {
    const { churchName, adminName, adminEmail, adminPassword, plan = 'free', amount = 0 } = req.body;

    if (!churchName || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (adminPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email already registered
    const existingUser = await db('users').where({ email: adminEmail }).first();
    if (existingUser) return res.status(409).json({ error: 'An account with this email already exists' });

    // Generate unique slug
    let baseSlug = slugify(churchName);
    let slug = baseSlug;
    let attempt = 0;
    while (await db('tenants').where({ slug }).first()) {
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    // Create tenant
    const [{ id: tenantId }] = await db('tenants').insert({
      name: churchName,
      slug,
      status: 'active',
      plan: plan || 'free',
      plan_amount: parseFloat(amount) || 0,
      admin_email: adminEmail,
    }).returning('id');

    // Create admin user
    const hash = await bcrypt.hash(adminPassword, 10);
    const [{ id: userId }] = await db('users').insert({
      email: adminEmail,
      password_hash: hash,
      name: adminName,
      role: 'admin',
      is_active: true,
      tenant_id: tenantId,
    }).returning('id');

    // Seed default categories for this tenant
    await seedDefaultCategories(tenantId, userId);

    await logAudit({
      entityType: 'tenant', entityId: tenantId, action: 'create',
      newValues: { name: churchName, slug, plan, admin_email: adminEmail },
      userId, userName: adminName, ipAddress: req.ip,
    });

    const payload = { id: userId, email: adminEmail, name: adminName, role: 'admin', tenant_id: tenantId };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // If paid plan and Stripe configured, create checkout session
    if (plan !== 'free' && parseFloat(amount) > 0) {
      const stripe = getStripe();
      if (stripe) {
        try {
          const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 4000}`;

          // Create or find Stripe customer
          const customer = await stripe.customers.create({
            email: adminEmail,
            name: churchName,
            metadata: { tenant_id: String(tenantId), slug },
          });
          await db('tenants').where({ id: tenantId }).update({ stripe_customer_id: customer.id });

          // Create one-time or recurring checkout session
          const session = await stripe.checkout.sessions.create({
            customer: customer.id,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `StewardView — ${churchName}`,
                  description: 'Monthly StewardView platform subscription',
                },
                unit_amount: Math.round(parseFloat(amount) * 100),
                recurring: { interval: 'month' },
              },
              quantity: 1,
            }],
            success_url: `${appUrl}/app/payment-success?session_id={CHECKOUT_SESSION_ID}&token=${token}`,
            cancel_url: `${appUrl}/#get-started`,
            metadata: { tenant_id: String(tenantId), slug },
            allow_promotion_codes: true,
          });

          return res.status(201).json({
            message: 'Church account created',
            checkoutUrl: session.url,
            tenant: { id: tenantId, name: churchName, slug },
          });
        } catch (stripeErr) {
          console.error('Stripe error (non-fatal):', stripeErr.message);
          // Fall through to return token without checkout
        }
      }
    }

    // Free plan or Stripe not configured — return token directly
    return res.status(201).json({
      message: 'Church account created',
      token,
      user: payload,
      tenant: { id: tenantId, name: churchName, slug },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// ── POST /api/onboarding/payment-success — confirm payment ──
router.post('/payment-success', async (req, res) => {
  try {
    const { session_id, token } = req.body;
    const stripe = getStripe();
    if (!stripe || !session_id) return res.status(400).json({ error: 'Missing session_id' });

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status === 'paid' || session.status === 'complete') {
      const tenantId = session.metadata?.tenant_id;
      if (tenantId) {
        await db('tenants').where({ id: tenantId }).update({
          status: 'active',
          stripe_subscription_id: session.subscription,
          plan: 'supported',
        });
      }
      res.json({ message: 'Payment confirmed', token });
    } else {
      res.status(400).json({ error: 'Payment not completed' });
    }
  } catch (err) {
    console.error('Payment confirmation error:', err);
    res.status(500).json({ error: 'Could not confirm payment' });
  }
});

// ── POST /api/onboarding/webhook — Stripe webhook ───────
router.post('/webhook', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.json({ received: true });

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const tenantId = session.metadata?.tenant_id;
        if (tenantId) {
          await db('tenants').where({ id: tenantId }).update({
            status: 'active',
            stripe_subscription_id: session.subscription,
            plan: 'supported',
          });
          console.log(`✅ Tenant ${tenantId} subscription activated`);
        }
        break;
      }
      case 'invoice.paid': {
        // Subscription renewed — ensure tenant stays active
        const invoice = event.data.object;
        const tenant = await db('tenants').where({ stripe_customer_id: invoice.customer }).first();
        if (tenant && tenant.status !== 'active') {
          await db('tenants').where({ id: tenant.id }).update({ status: 'active', suspended_at: null });
          console.log(`✅ Tenant ${tenant.id} subscription payment received, reactivated`);
        }
        break;
      }
      case 'invoice.payment_failed': {
        // Payment failed — notify but don't immediately suspend (grace period)
        const invoice = event.data.object;
        const tenant = await db('tenants').where({ stripe_customer_id: invoice.customer }).first();
        if (tenant) {
          await db('tenants').where({ id: tenant.id }).update({
            notes: `Payment failed on ${new Date().toDateString()}. Grace period active.`,
          });
          console.warn(`⚠️ Tenant ${tenant.id} payment failed`);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        // Subscription canceled — suspend the tenant, preserve data
        const sub = event.data.object;
        const tenant = await db('tenants').where({ stripe_subscription_id: sub.id }).first();
        if (tenant) {
          await db('tenants').where({ id: tenant.id }).update({
            status: 'suspended',
            suspended_at: new Date().toISOString(),
            notes: 'Subscription canceled via Stripe. Data preserved.',
          });
          console.log(`🔒 Tenant ${tenant.id} suspended — subscription canceled`);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        if (sub.status === 'active') {
          const tenant = await db('tenants').where({ stripe_subscription_id: sub.id }).first();
          if (tenant) {
            await db('tenants').where({ id: tenant.id }).update({ status: 'active', suspended_at: null });
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
  }

  res.json({ received: true });
});

// ── GET /api/onboarding/tenant-info — public info for login page ──
router.get('/tenant-info/:slug', async (req, res) => {
  try {
    const tenant = await db('tenants').where({ slug: req.params.slug }).first();
    if (!tenant) return res.status(404).json({ error: 'Church not found' });
    res.json({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      primary_color: tenant.primary_color,
      accent_color: tenant.accent_color,
      logo_url: tenant.logo_url,
      status: tenant.status,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Seed default categories for new tenants ───────────────
async function seedDefaultCategories(tenantId, userId) {
  const categories = [
    { name: 'Tithes & Offerings', type: 'income', description: 'General weekly contributions', tenant_id: tenantId },
    { name: 'Directed Contributions', type: 'income', description: 'Funds given for specific purposes', tenant_id: tenantId },
    { name: 'Special Events', type: 'income', description: 'VBS, fundraisers, etc.', tenant_id: tenantId },
    { name: 'Interest Income', type: 'income', description: 'Bank interest', tenant_id: tenantId },
    { name: 'Salaries & Benefits', type: 'expense', description: 'Minister, staff compensation', tenant_id: tenantId },
    { name: 'Utilities', type: 'expense', description: 'Electric, water, gas, internet', tenant_id: tenantId },
    { name: 'Building & Maintenance', type: 'expense', description: 'Repairs, janitorial, insurance', tenant_id: tenantId },
    { name: 'Missions & Outreach', type: 'expense', description: 'Supported missionaries and programs', tenant_id: tenantId },
    { name: 'Benevolence', type: 'expense', description: 'Member and community assistance', tenant_id: tenantId },
    { name: 'Education & Youth', type: 'expense', description: 'Bible classes, VBS, youth events', tenant_id: tenantId },
    { name: 'Worship & Media', type: 'expense', description: 'A/V equipment, streaming, supplies', tenant_id: tenantId },
    { name: 'Office & Administration', type: 'expense', description: 'Supplies, postage, software', tenant_id: tenantId },
    { name: 'Insurance', type: 'expense', description: 'Property, liability insurance', tenant_id: tenantId },
    { name: 'Mortgage / Rent', type: 'expense', description: 'Building payments', tenant_id: tenantId },
  ];
  await db('categories').insert(categories);
}

module.exports = router;
