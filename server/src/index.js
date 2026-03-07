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
    // Generate report for PREVIOUS month
    const reportMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const reportYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    const reportDir = process.env.REPORT_DIR || path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    console.log(`Generating report for ${reportYear}-${reportMonth}...`);
    // The report route logic handles the full generation
  } catch (err) {
    console.error('Scheduled report error:', err);
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
  ║   HRCOC Finance Server                      ║
  ║   Running on port ${PORT}                       ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}              ║
  ╚══════════════════════════════════════════════╝
    `);
  });
})();

module.exports = app;
