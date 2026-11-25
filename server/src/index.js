require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const db = require('./models/db');

// Routes
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const fundRoutes = require('./routes/funds');
const budgetRoutes = require('./routes/budgets');
const bankRoutes = require('./routes/bank');
const reportRoutes = require('./routes/reports');
const auditRoutes = require('./routes/audit');
const categoryRoutes = require('./routes/categories');
const backupRoutes = require('./routes/backups');
const platformRoutes = require('./routes/platform');
const onboardingRoutes = require('./routes/onboarding');

const app = express();
const PORT = process.env.PORT || 4000;
let appReady = false;

const trustProxy = process.env.TRUST_PROXY || (process.env.NODE_ENV === 'production' ? '1' : 'false');
if (trustProxy !== 'false') {
  app.set('trust proxy', trustProxy === 'true' ? 1 : parseInt(trustProxy, 10));
}

// ── Middleware ────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Allow React inline scripts in production
}));

// CORS: in production the React client is served from the same origin
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:5173'];
app.use(cors({ origin: corsOrigins, credentials: true }));

// Raw body required for Stripe webhook signature verification (must come BEFORE express.json)
app.use('/api/onboarding/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Import is too large. Try a smaller date range, or split the CSV into smaller batches.',
    });
  }
  return next(err);
});

// Skip health check pings from logs; use concise format in dev, minimal in prod
app.use(morgan(process.env.NODE_ENV === 'production' ? 'short' : 'dev', {
  skip: (req) => req.path === '/api/health',
}));

// Block bots probing for env/config files
app.use((req, res, next) => {
  if (/^\/.env/.test(req.path) || /\.(git|sql|bak|config)/.test(req.path)) {
    return res.status(404).end();
  }
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// Stricter rate limit on auth endpoints (login, signup, password changes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many authentication attempts, please try again later' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth/accept-invite', authLimiter);
app.use('/api/auth/change-password', authLimiter);
app.use('/api/onboarding/register', authLimiter);

// Very strict limit on MFA code verification (6-digit codes are brute-forceable)
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many verification attempts. Please request a new code.' },
});
app.use('/api/auth/verify-mfa', mfaLimiter);

// ── API Routes ───────────────────────────────────────────
// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: appReady ? 'ok' : 'starting',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (appReady) return next();
  return res.status(503).json({ error: 'Server is still starting. Please try again shortly.' });
});

app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/funds', fundRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/bank', bankRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/onboarding', onboardingRoutes);

// Serve the public landing/marketing page
const landingPath = path.join(__dirname, '..', '..', 'landing');
if (fs.existsSync(landingPath)) {
  // Elder briefings are shared locally only.
  app.use('/landing/elders-briefing.html', (req, res) => res.status(404).end());
  app.use('/landing/budget-briefing.html', (req, res) => res.status(404).end());
  app.use('/landing', express.static(landingPath));
  app.get('/', (req, res) => res.sendFile(path.join(landingPath, 'index.html')));
  app.get('/privacy', (req, res) => res.sendFile(path.join(landingPath, 'privacy.html')));
  app.get('/terms', (req, res) => res.sendFile(path.join(landingPath, 'terms.html')));
}

// Legacy app URLs now live under /app
app.get(['/login', '/suspended', '/payment-success'], (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(`/app${req.path}${query}`);
});

// ── Cron: Monthly report on 1st of each month at 6 AM ───
cron.schedule('0 6 1 * *', async () => {
  console.log('🕐 Running scheduled monthly report generation...');
  try {
    const { generateMonthlyReportPDF } = require('./reports/generateMonthlyReport');
    const now = new Date();
    const reportMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const reportYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    const reportDir = process.env.REPORT_DIR || path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    console.log(`Generating report for ${reportYear}-${reportMonth}...`);
  } catch (err) {
    console.error('Scheduled report error:', err);
  }
});

// ── Cron: Daily backup at 2 AM ──────────────────────────
cron.schedule('0 2 * * *', async () => {
  console.log('🗄️ Running scheduled daily backups (one per church)...');
  try {
    const { runScheduledBackups } = require('./services/backups');
    const { ok, failed } = await runScheduledBackups();
    console.log(`✅ Backups complete: ${ok} churches${failed ? `, ${failed} failed` : ''}`);
  } catch (err) {
    console.error('Scheduled backup error:', err);
  }
});

// ── Cron: Clean up expired/used MFA codes every 6 hours ─
cron.schedule('0 */6 * * *', async () => {
  try {
    const deleted = await db('mfa_codes')
      .where('used', true)
      .orWhere('expires_at', '<', new Date())
      .del();
    if (deleted > 0) console.log(`Cleaned up ${deleted} expired/used MFA codes`);
  } catch (err) {
    console.error('MFA code cleanup error:', err);
  }
});

const { appTimeZone } = require('./utils/dates');

async function runRecurringJob() {
  const { runRecurringTransfers } = require('./services/recurringTransfers');
  const { todayInTimeZone } = require('./utils/dates');
  const summary = await runRecurringTransfers({ db, today: todayInTimeZone() });
  console.log(`Recurring transfers: posted ${summary.posted_count || 0}, blocked ${summary.skipped_count || 0}, missed dates left alone ${summary.ignored_missed || 0}`);
}

// ── Cron: recurring fund transfers at 7 AM Central ──────
// Only the date that is due today is posted. Older dates are skipped.
cron.schedule('0 7 * * *', () => {
  console.log('Running recurring fund transfers...');
  runRecurringJob().catch((err) => console.error('Recurring transfer cron error:', err));
}, { timezone: appTimeZone() });

// ── Cron: SimpleFIN bank sync once a day, off the top of the hour ─
cron.schedule('17 6 * * *', () => {
  console.log('Running daily bank sync...');
  const { syncBankConnections } = require('./services/bankSync');
  syncBankConnections({ force: false }).catch((err) => console.error('Bank sync cron error:', err));
}, { timezone: appTimeZone() });

// ── Serve React client in production ─────────────────────
const clientBuildPath = path.join(__dirname, '..', '..', 'client', 'build');
if (process.env.NODE_ENV === 'production' || fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  // All non-API routes serve the React app (client-side routing)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// ── Error handling ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function initializeApp() {
  if (process.env.NODE_ENV !== 'production') {
    appReady = true;
    return;
  }

  if (!process.env.DATABASE_URL) {
    // Keep the error message clear in logs but do not crash the process.
    // The healthcheck will pass (HTTP 200 status:starting) so Railway won't
    // kill the container; the operator can see this error and add DATABASE_URL.
    throw new Error('DATABASE_URL is required in production. Attach a Railway PostgreSQL service or set the variable explicitly.');
  }

  const maxAttempts = parseInt(process.env.DB_STARTUP_MAX_ATTEMPTS || '10', 10);
  const retryDelayMs = parseInt(process.env.DB_STARTUP_RETRY_MS || '3000', 10);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Running database migrations (attempt ${attempt}/${maxAttempts})...`);
      await db.migrate.latest();
      console.log('Migrations complete.');
      appReady = true;
      runRecurringJob().catch((err) => console.error('Recurring transfer startup error:', err));
      const { syncBankConnections } = require('./services/bankSync');
      syncBankConnections({ force: false }).catch((err) => console.error('Bank sync startup error:', err));
      return;
    } catch (err) {
      lastError = err;
      console.error(`Migration attempt ${attempt} failed:`, err.message || err);
      if (attempt < maxAttempts) {
        await sleep(retryDelayMs);
      }
    }
  }

  throw lastError;
}

// ── Start ────────────────────────────────────────────────
(async () => {
  // Warn loudly if JWT_SECRET is the insecure default in production
  if (process.env.NODE_ENV === 'production') {
    const missing = [];
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('change') || process.env.JWT_SECRET === 'dev-secret') missing.push('JWT_SECRET');
    if (!process.env.PLATFORM_ADMIN_SECRET || process.env.PLATFORM_ADMIN_SECRET.includes('change')) missing.push('PLATFORM_ADMIN_SECRET');
    if (missing.length) {
      console.error(`FATAL: Missing or insecure production secrets: ${missing.join(', ')}. Server will not start.`);
      process.exit(1);
    }
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
  ╔══════════════════════════════════════════════╗
  ║   StewardView Server                        ║
  ║   Running on port ${PORT}                       ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}              ║
  ╚══════════════════════════════════════════════╝
    `);
  });

  try {
    await initializeApp();
  } catch (err) {
    // Log the error but keep the server alive so Railway's healthcheck can
    // respond and the operator can diagnose the issue in logs.
    // appReady remains false, so all API routes return 503 until fixed.
    console.error('Startup error (server will stay up but API is unavailable):', err.message || err);
  }
})();

module.exports = app;
