const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../models/db');

/**
 * Generate a PDF monthly finance report.
 */
async function generateMonthlyReportPDF(data, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const blue = '#1a56db';
    const darkGray = '#333333';
    const lightGray = '#f3f4f6';
    const green = '#059669';
    const red = '#dc2626';

    // ── Header ───────────────────────────────────────────
    doc.fontSize(20).fillColor(blue).text('StewardView Finance Report', { align: 'center' });
    doc.fontSize(14).fillColor(darkGray).text(data.title.replace('StewardView Monthly Finance Report — ', ''), { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#666').text(`Generated: ${new Date(data.generated_at).toLocaleString()}`, { align: 'center' });
    doc.moveDown(1);
    drawLine(doc);

    // ── Bank Balances ────────────────────────────────────
    sectionHeader(doc, 'Bank Account Balances');
    data.bank_accounts.forEach(acc => {
      doc.fontSize(10).fillColor(darkGray)
        .text(`${acc.name}`, 72, doc.y, { continued: true })
        .text(`$${fmtNum(acc.current_balance)}`, { align: 'right' });
    });
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(blue)
      .text(`Total Bank Balance:`, 72, doc.y, { continued: true })
      .text(`$${fmtNum(data.total_bank_balance)}`, { align: 'right' });
    doc.font('Helvetica');
    doc.moveDown(1);
    drawLine(doc);

    // ── Income Summary ───────────────────────────────────
    sectionHeader(doc, 'Income Summary');
    data.income.by_category.forEach(item => {
      doc.fontSize(10).fillColor(darkGray)
        .text(`${item.category}`, 72, doc.y, { continued: true })
        .text(`$${fmtNum(item.total)}`, { align: 'right' });
    });
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(green)
      .text(`Total Income:`, 72, doc.y, { continued: true })
      .text(`$${fmtNum(data.income.total)}`, { align: 'right' });
    doc.font('Helvetica');
    doc.moveDown(1);
    drawLine(doc);

    // ── Expense Summary ──────────────────────────────────
    sectionHeader(doc, 'Expense Summary');
    data.expenses.by_category.forEach(item => {
      doc.fontSize(10).fillColor(darkGray)
        .text(`${item.category}`, 72, doc.y, { continued: true })
        .text(`$${fmtNum(item.total)}`, { align: 'right' });
    });
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(red)
      .text(`Total Expenses:`, 72, doc.y, { continued: true })
      .text(`$${fmtNum(data.expenses.total)}`, { align: 'right' });
    doc.font('Helvetica');
    doc.moveDown(0.5);

    const netColor = data.net_income >= 0 ? green : red;
    doc.fontSize(12).font('Helvetica-Bold').fillColor(netColor)
      .text(`Net Income:`, 72, doc.y, { continued: true })
      .text(`$${fmtNum(data.net_income)}`, { align: 'right' });
    doc.font('Helvetica');
    doc.moveDown(1);
    drawLine(doc);

    // ── Earmarked Fund Balances ──────────────────────────
    sectionHeader(doc, 'Earmarked Fund Balances');
    data.funds.forEach(fund => {
      const targetStr = fund.target_amount ? ` (Goal: $${fmtNum(fund.target_amount)})` : '';
      const restricted = fund.is_restricted ? ' [RESTRICTED]' : '';
      doc.fontSize(10).fillColor(darkGray)
        .text(`${fund.name}${restricted}${targetStr}`, 72, doc.y, { continued: true })
        .text(`$${fmtNum(fund.current_balance)}`, { align: 'right' });
    });
    doc.moveDown(1);
    drawLine(doc);

    // ── Budget vs Actual ─────────────────────────────────
    if (data.budget_comparison.length > 0) {
      // Check if we need a new page
      if (doc.y > 580) doc.addPage();

      sectionHeader(doc, 'Budget vs. Actual');

      // Table header
      doc.fontSize(9).font('Helvetica-Bold').fillColor(darkGray);
      const tableLeft = 72;
      doc.text('Category', tableLeft, doc.y);
      doc.text('Budgeted', 300, doc.y - 11);
      doc.text('Actual', 380, doc.y - 11);
      doc.text('Variance', 455, doc.y - 11);
      doc.font('Helvetica');
      doc.moveDown(0.5);

      // Income items
      const incomeItems = data.budget_comparison.filter(b => b.type === 'income');
      if (incomeItems.length > 0) {
        doc.fontSize(9).font('Helvetica-Bold').text('INCOME', tableLeft, doc.y);
        doc.font('Helvetica');
        incomeItems.forEach(item => {
          const varColor = item.variance >= 0 ? green : red;
          const y = doc.y;
          doc.fontSize(9).fillColor(darkGray).text(`  ${item.category}`, tableLeft, y);
          doc.text(`$${fmtNum(item.budgeted)}`, 300, y);
          doc.text(`$${fmtNum(item.actual)}`, 380, y);
          doc.fillColor(varColor).text(`$${fmtNum(item.variance)}`, 455, y);
        });
        doc.moveDown(0.5);
      }

      // Expense items
      const expenseItems = data.budget_comparison.filter(b => b.type === 'expense');
      if (expenseItems.length > 0) {
        doc.fontSize(9).font('Helvetica-Bold').fillColor(darkGray).text('EXPENSES', tableLeft, doc.y);
        doc.font('Helvetica');
        expenseItems.forEach(item => {
          const varColor = item.variance <= 0 ? green : red; // under budget is good for expenses
          const y = doc.y;
          doc.fontSize(9).fillColor(darkGray).text(`  ${item.category}`, tableLeft, y);
          doc.text(`$${fmtNum(item.budgeted)}`, 300, y);
          doc.text(`$${fmtNum(item.actual)}`, 380, y);
          doc.fillColor(varColor).text(`$${fmtNum(item.variance)}`, 455, y);
        });
      }
      doc.moveDown(1);
      drawLine(doc);
    }

    // ── Transaction Detail ───────────────────────────────
    if (doc.y > 550) doc.addPage();
    sectionHeader(doc, 'Transaction Detail');

    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkGray);
    doc.text('Date', 50, doc.y);
    doc.text('Description', 110, doc.y - 9);
    doc.text('Category', 290, doc.y - 9);
    doc.text('Fund', 380, doc.y - 9);
    doc.text('Amount', 470, doc.y - 9);
    doc.font('Helvetica').moveDown(0.3);

    data.transactions.forEach(txn => {
      if (doc.y > 700) doc.addPage();
      const y = doc.y;
      const amtColor = txn.type === 'income' ? green : red;
      const prefix = txn.type === 'income' ? '+' : '-';

      doc.fontSize(7).fillColor(darkGray);
      doc.text(txn.date, 50, y);
      doc.text((txn.description || '').substring(0, 35), 110, y);
      doc.text((txn.category_name || '').substring(0, 18), 290, y);
      doc.text((txn.fund_name || '').substring(0, 15), 380, y);
      doc.fillColor(amtColor).text(`${prefix}$${fmtNum(txn.amount)}`, 470, y);
    });

    // ── Footer ───────────────────────────────────────────
    doc.moveDown(2);
    drawLine(doc);
    doc.fontSize(8).fillColor('#999')
      .text('This report was generated by StewardView — Church Finance Transparency Platform.', { align: 'center' })
      .text('All financial records are auditable and traceable.', { align: 'center' });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function sectionHeader(doc, title) {
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#1a56db').text(title);
  doc.font('Helvetica').moveDown(0.5);
}

function drawLine(doc) {
  doc.strokeColor('#e5e7eb').lineWidth(1)
    .moveTo(50, doc.y).lineTo(562, doc.y).stroke();
  doc.moveDown(0.5);
}

function fmtNum(n) {
  return parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// CLI support: node src/reports/generateMonthlyReport.js [year] [month]
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

  const year = parseInt(process.argv[2]) || new Date().getFullYear();
  const month = parseInt(process.argv[3]) || new Date().getMonth() + 1;

  (async () => {
    try {
      // Require these after dotenv
      const dbModule = require('../models/db');
      const reportDir = process.env.REPORT_DIR || path.join(__dirname, '..', '..', 'reports');

      if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

      const fileName = `StewardView_Monthly_Report_${year}_${String(month).padStart(2, '0')}.pdf`;
      const filePath = path.join(reportDir, fileName);

      // Build report data inline (same logic as route)
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().slice(0, 10);
      const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

      const bankAccounts = await dbModule('bank_accounts').where({ is_active: true });
      const incomeByCategory = await dbModule('transactions')
        .leftJoin('categories', 'transactions.category_id', 'categories.id')
        .where('transactions.type', 'income').where('transactions.status', '!=', 'void')
        .whereBetween('transactions.date', [startDate, endDate])
        .groupBy('categories.name').select('categories.name as category').sum('transactions.amount as total');
      const expenseByCategory = await dbModule('transactions')
        .leftJoin('categories', 'transactions.category_id', 'categories.id')
        .where('transactions.type', 'expense').where('transactions.status', '!=', 'void')
        .whereBetween('transactions.date', [startDate, endDate])
        .groupBy('categories.name').select('categories.name as category').sum('transactions.amount as total');
      const totalIncome = incomeByCategory.reduce((s, c) => s + parseFloat(c.total || 0), 0);
      const totalExpenses = expenseByCategory.reduce((s, c) => s + parseFloat(c.total || 0), 0);
      const funds = await dbModule('funds').where({ is_active: true });
      const budgets = await dbModule('budgets')
        .leftJoin('categories', 'budgets.category_id', 'categories.id')
        .where({ 'budgets.year': year, 'budgets.month': month })
        .select('budgets.*', 'categories.name as category_name', 'categories.type as category_type');
      const actuals = await dbModule('transactions')
        .where('status', '!=', 'void').whereBetween('date', [startDate, endDate])
        .groupBy('category_id').select('category_id').sum('amount as actual_amount');
      const actualMap = {};
      actuals.forEach(a => { actualMap[a.category_id] = parseFloat(a.actual_amount) || 0; });
      const budgetComparison = budgets.map(b => ({
        category: b.category_name, type: b.category_type,
        budgeted: parseFloat(b.budgeted_amount), actual: actualMap[b.category_id] || 0,
        variance: (actualMap[b.category_id] || 0) - parseFloat(b.budgeted_amount),
      }));
      const allTransactions = await dbModule('transactions')
        .leftJoin('categories', 'transactions.category_id', 'categories.id')
        .leftJoin('funds', 'transactions.fund_id', 'funds.id')
        .where('transactions.status', '!=', 'void')
        .whereBetween('transactions.date', [startDate, endDate])
        .select('transactions.*', 'categories.name as category_name', 'funds.name as fund_name')
        .orderBy('transactions.date');

      const reportData = {
        title: `StewardView Monthly Finance Report — ${monthName} ${year}`,
        period: { year, month, month_name: monthName, start_date: startDate, end_date: endDate },
        bank_accounts: bankAccounts,
        total_bank_balance: bankAccounts.reduce((s, a) => s + parseFloat(a.current_balance || 0), 0),
        income: { by_category: incomeByCategory, total: totalIncome },
        expenses: { by_category: expenseByCategory, total: totalExpenses },
        net_income: totalIncome - totalExpenses,
        funds, budget_comparison: budgetComparison,
        transactions: allTransactions,
        generated_at: new Date().toISOString(),
      };

      await generateMonthlyReportPDF(reportData, filePath);
      console.log(`✅ Report generated: ${filePath}`);
      process.exit(0);
    } catch (err) {
      console.error('Report generation failed:', err);
      process.exit(1);
    }
  })();
}

module.exports = { generateMonthlyReportPDF };
