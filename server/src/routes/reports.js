const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../models/auditLog');
const { generateMonthlyReportPDF } = require('../reports/generateMonthlyReport');

const REPORT_DIR = process.env.REPORT_DIR || path.join(__dirname, '..', '..', 'reports');

// GET /api/reports/monthly?year=2026&month=3
router.get('/monthly', authenticate, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;

    const reportData = await buildMonthlyReportData(year, month);
    res.json(reportData);
  } catch (err) {
    console.error('Monthly report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/reports/monthly/generate — generate PDF
router.post('/monthly/generate', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const year = parseInt(req.body.year) || new Date().getFullYear();
    const month = parseInt(req.body.month) || new Date().getMonth() + 1;

    const reportData = await buildMonthlyReportData(year, month);

    // Ensure report directory exists
    if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

    const fileName = `HRCOC_Monthly_Report_${year}_${String(month).padStart(2, '0')}.pdf`;
    const filePath = path.join(REPORT_DIR, fileName);

    await generateMonthlyReportPDF(reportData, filePath);

    // Save report record
    const existing = await db('monthly_reports').where({ year, month }).first();
    if (existing) {
      await db('monthly_reports').where({ id: existing.id }).update({
        file_path: filePath,
        summary_json: JSON.stringify(reportData),
        generated_by: req.user.id,
        generated_at: new Date().toISOString(),
      });
    } else {
      await db('monthly_reports').insert({
        year, month, file_path: filePath,
        summary_json: JSON.stringify(reportData),
        generated_by: req.user.id,
      });
    }

    await logAudit({
      entityType: 'report', entityId: 0, action: 'generate',
      newValues: { year, month, fileName },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.json({ message: 'Report generated', file: fileName, data: reportData });
  } catch (err) {
    console.error('Generate report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/reports/monthly/download?year=2026&month=3
router.get('/monthly/download', authenticate, async (req, res) => {
  try {
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);
    const report = await db('monthly_reports').where({ year, month }).first();
    if (!report || !report.file_path || !fs.existsSync(report.file_path)) {
      return res.status(404).json({ error: 'Report not found. Generate it first.' });
    }
    res.download(report.file_path);
  } catch (err) {
    console.error('Download report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/reports/list — list all generated reports
router.get('/list', authenticate, async (req, res) => {
  const reports = await db('monthly_reports').orderBy(['year', 'month']);
  res.json(reports);
});

// GET /api/reports/dashboard — summary data for dashboard
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

    // Bank balances
    const bankAccounts = await db('bank_accounts').where({ is_active: true });
    const totalBankBalance = bankAccounts.reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);

    // Month income & expenses
    const monthIncome = await db('transactions')
      .where('type', 'income').where('status', '!=', 'void')
      .whereBetween('date', [startDate, endDate])
      .sum('amount as total').first();

    const monthExpenses = await db('transactions')
      .where('type', 'expense').where('status', '!=', 'void')
      .whereBetween('date', [startDate, endDate])
      .sum('amount as total').first();

    // Fund balances
    const funds = await db('funds').where({ is_active: true });

    // Recent transactions
    const recentTransactions = await db('transactions')
      .leftJoin('categories', 'transactions.category_id', 'categories.id')
      .select('transactions.*', 'categories.name as category_name')
      .where('transactions.status', '!=', 'void')
      .orderBy('transactions.date', 'desc')
      .limit(10);

    res.json({
      bank: { accounts: bankAccounts, total_balance: totalBankBalance },
      month: {
        year, month,
        income: parseFloat(monthIncome.total) || 0,
        expenses: parseFloat(monthExpenses.total) || 0,
        net: (parseFloat(monthIncome.total) || 0) - (parseFloat(monthExpenses.total) || 0),
      },
      funds,
      recent_transactions: recentTransactions,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Helper: build monthly report data ───────────────────
async function buildMonthlyReportData(year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10);
  const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

  // Bank balances
  const bankAccounts = await db('bank_accounts').where({ is_active: true });

  // Income by category
  const incomeByCategory = await db('transactions')
    .leftJoin('categories', 'transactions.category_id', 'categories.id')
    .where('transactions.type', 'income')
    .where('transactions.status', '!=', 'void')
    .whereBetween('transactions.date', [startDate, endDate])
    .groupBy('categories.name')
    .select('categories.name as category')
    .sum('transactions.amount as total');

  // Expense by category
  const expenseByCategory = await db('transactions')
    .leftJoin('categories', 'transactions.category_id', 'categories.id')
    .where('transactions.type', 'expense')
    .where('transactions.status', '!=', 'void')
    .whereBetween('transactions.date', [startDate, endDate])
    .groupBy('categories.name')
    .select('categories.name as category')
    .sum('transactions.amount as total');

  const totalIncome = incomeByCategory.reduce((s, c) => s + parseFloat(c.total || 0), 0);
  const totalExpenses = expenseByCategory.reduce((s, c) => s + parseFloat(c.total || 0), 0);

  // Fund balances
  const funds = await db('funds').where({ is_active: true });

  // Budget vs actual
  const budgets = await db('budgets')
    .leftJoin('categories', 'budgets.category_id', 'categories.id')
    .where({ 'budgets.year': year, 'budgets.month': month })
    .select('budgets.*', 'categories.name as category_name', 'categories.type as category_type');

  const actuals = await db('transactions')
    .where('status', '!=', 'void')
    .whereBetween('date', [startDate, endDate])
    .groupBy('category_id')
    .select('category_id')
    .sum('amount as actual_amount');

  const actualMap = {};
  actuals.forEach(a => { actualMap[a.category_id] = parseFloat(a.actual_amount) || 0; });

  const budgetComparison = budgets.map(b => ({
    category: b.category_name,
    type: b.category_type,
    budgeted: parseFloat(b.budgeted_amount),
    actual: actualMap[b.category_id] || 0,
    variance: (actualMap[b.category_id] || 0) - parseFloat(b.budgeted_amount),
  }));

  // All transactions for the month
  const allTransactions = await db('transactions')
    .leftJoin('categories', 'transactions.category_id', 'categories.id')
    .leftJoin('funds', 'transactions.fund_id', 'funds.id')
    .where('transactions.status', '!=', 'void')
    .whereBetween('transactions.date', [startDate, endDate])
    .select('transactions.*', 'categories.name as category_name', 'funds.name as fund_name')
    .orderBy('transactions.date');

  return {
    title: `HRCOC Monthly Finance Report — ${monthName} ${year}`,
    period: { year, month, month_name: monthName, start_date: startDate, end_date: endDate },
    bank_accounts: bankAccounts,
    total_bank_balance: bankAccounts.reduce((s, a) => s + parseFloat(a.current_balance || 0), 0),
    income: { by_category: incomeByCategory, total: totalIncome },
    expenses: { by_category: expenseByCategory, total: totalExpenses },
    net_income: totalIncome - totalExpenses,
    funds,
    budget_comparison: budgetComparison,
    transactions: allTransactions,
    generated_at: new Date().toISOString(),
  };
}

module.exports = router;
