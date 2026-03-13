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
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// ── API Routes ───────────────────────────────────────────
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
}

// Legacy app URLs now live under /app
app.get(['/login', '/suspended', '/payment-success'], (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(`/app${req.path}${query}`);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
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

// ── Start ────────────────────────────────────────────────
(async () => {
  // Run migrations on startup in production
  if (process.env.NODE_ENV === 'production') {
    try {
      console.log('Running database migrations...');
      await db.migrate.latest();
      console.log('Migrations complete.');
    } catch (err) {
      console.error('Migration error:', err);
      process.exit(1);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
  ╔══════════════════════════════════════════════╗
  ║   StewardView Server                        ║
  ║   Running on port ${PORT}                       ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}              ║
  ╚══════════════════════════════════════════════╝
    `);
  });
})();

module.exports = app;
