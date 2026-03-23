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
const givelifyRoutes = require('./routes/givelify');
const backupRoutes = require('./routes/backups');
const platformRoutes = require('./routes/platform');
const onboardingRoutes = require('./routes/onboarding');

const app = express();
const PORT = process.env.PORT || 4000;
let appReady = false;

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

app.use(express.json());
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
app.use('/api/givelify', givelifyRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/onboarding', onboardingRoutes);

// Serve the public landing/marketing page
const landingPath = path.join(__dirname, '..', '..', 'landing');
if (fs.existsSync(landingPath)) {
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
  console.log('🗄️ Running scheduled daily backup...');
  try {
    const BACKUP_TABLES = [
      'users', 'bank_accounts', 'categories', 'funds', 'transactions',
      'fund_transactions', 'budgets', 'audit_log', 'bank_sync_log',
      'monthly_reports', 'givelify_contributions', 'data_backups', 'app_settings',
    ];
    const backupData = {};
    let totalRows = 0;
    const tablesBackedUp = [];
    for (const table of BACKUP_TABLES) {
      try {
        const hasTable = await db.schema.hasTable(table);
        if (!hasTable) continue;
        const rows = await db(table).select('*');
        backupData[table] = rows;
        totalRows += rows.length;
        tablesBackedUp.push(table);
      } catch { /* skip */ }
    }
    await db('data_backups').insert({
      backup_type: 'scheduled',
      status: 'success',
      tables_included: JSON.stringify(tablesBackedUp),
      row_count: totalRows,
      backup_data: JSON.stringify(backupData),
    });
    // Keep only last 30 scheduled backups
    const oldBackups = await db('data_backups')
      .where({ backup_type: 'scheduled' })
      .orderBy('created_at', 'desc')
      .offset(30)
      .select('id');
    if (oldBackups.length > 0) {
      await db('data_backups').whereIn('id', oldBackups.map(b => b.id)).del();
    }
    console.log(`✅ Backup complete: ${tablesBackedUp.length} tables, ${totalRows} rows`);
  } catch (err) {
    console.error('Scheduled backup error:', err);
  }
});

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
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret')) {
    console.error('SECURITY WARNING: JWT_SECRET is not set or is using the insecure default. Set a strong JWT_SECRET environment variable immediately.');
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
