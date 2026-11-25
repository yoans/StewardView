const db = require('../models/db');
const { categoryCoveredByFund, coverageForCategories } = require('./fundTransferCategories');
const { todayInTimeZone } = require('./dates');

function monthEndDate(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

async function loadTransferCoverage(tenantId) {
  const hasTransfers = await db.schema.hasTable('recurring_transfers');
  if (!hasTransfers) return new Map();
  const transfers = await db('recurring_transfers')
    .join('funds', 'funds.id', 'recurring_transfers.to_fund_id')
    .where('recurring_transfers.tenant_id', tenantId)
    .where('recurring_transfers.is_active', true)
    .select('funds.name as fund_name', 'recurring_transfers.amount', 'recurring_transfers.is_active');
  const categories = await db('categories')
    .where({ tenant_id: tenantId, is_active: true, type: 'expense' })
    .select('id', 'name', 'type');
  return coverageForCategories(categories, transfers);
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function uncategorizedTotals(tenantId, startDate, endDate) {
  const rows = await db('transactions')
    .where({ tenant_id: tenantId })
    .whereNot('status', 'void')
    .whereNull('category_id')
    .whereNot('type', 'transfer')
    .whereBetween('date', [startDate, endDate])
    .groupBy('type')
    .select('type')
    .sum('amount as total');
  const totals = { income: 0, expense: 0 };
  rows.forEach((row) => {
    if (row.type === 'income' || row.type === 'expense') totals[row.type] = roundMoney(row.total);
  });
  return totals;
}

/**
 * Operating budget versus money that actually left the bank.
 * Categories covered by an active fund transfer are not part of the plan.
 * Real spending in those categories is returned separately.
 */
async function budgetSnapshot({ tenantId, year, startDate, endDate, budgetQuery, monthsInPlan = 1 }) {
  const budgets = await budgetQuery;
  const { categoryActualsMap } = require('./budgetActuals');
  const actualMap = await categoryActualsMap(tenantId, startDate, endDate);
  const categories = await db('categories')
    .where({ tenant_id: tenantId })
    .select('id', 'name', 'type', 'sort_order', 'group_name', 'is_active');
  const byId = new Map(categories.map((category) => [Number(category.id), category]));
  const coverage = await loadTransferCoverage(tenantId);

  const budgetByCategory = new Map();
  budgets.forEach((row) => {
    budgetByCategory.set(Number(row.category_id), roundMoney(row.budgeted));
  });

  const ids = new Set([...budgetByCategory.keys(), ...Object.keys(actualMap).map(Number)]);
  const operating = [];
  const fundSpending = [];

  for (const id of ids) {
    const category = byId.get(id);
    if (!category || category.is_active === false) continue;
    const budgeted = budgetByCategory.get(id) || 0;
    const actual = roundMoney(actualMap[id] || 0);
    const covered = coverage.get(id);
    const line = {
      category_id: id,
      category_name: category.name,
      category_type: category.type,
      group_name: category.group_name || (category.type === 'income' ? 'Giving' : 'Other'),
      sort_order: category.sort_order || 0,
      budgeted: covered ? 0 : budgeted,
      actual,
      remaining: roundMoney((covered ? 0 : budgeted) - actual),
      covered_by_transfer: Boolean(covered),
    };
    if (covered) {
      if (actual > 0) fundSpending.push(line);
      continue;
    }
    if (budgeted > 0 || actual > 0) operating.push(line);
  }

  operating.sort((a, b) => a.sort_order - b.sort_order || a.category_name.localeCompare(b.category_name));
  fundSpending.sort((a, b) => a.sort_order - b.sort_order || a.category_name.localeCompare(b.category_name));

  const sum = (rows, field, type) => roundMoney(rows.filter((row) => row.category_type === type).reduce((total, row) => total + row[field], 0));
  const uncategorized = await uncategorizedTotals(tenantId, startDate, endDate);
  const transfers = [];
  coverage.forEach((info) => {
    transfers.push({ fund_name: info.fund_name, amount: roundMoney(info.amount) });
  });
  const seen = new Set();
  const fundTransfers = transfers.filter((transfer) => {
    const key = `${transfer.fund_name}|${transfer.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const funds = await fundActivity(tenantId, startDate, endDate);
  const monthlyFixed = roundMoney(sum(operating, 'budgeted', 'expense') / Math.max(1, Number(monthsInPlan) || 1));
  const generalFund = await generalFundReserve(tenantId, monthlyFixed);

  return {
    year,
    line_items: operating,
    fund_spending: fundSpending,
    fund_transfers: fundTransfers,
    funds,
    general_fund: generalFund,
    uncategorized,
    summary: {
      total_budgeted_income: sum(operating, 'budgeted', 'income'),
      total_actual_income: sum(operating, 'actual', 'income'),
      total_budgeted_expense: sum(operating, 'budgeted', 'expense'),
      total_actual_expense: sum(operating, 'actual', 'expense'),
      budgeted_net: roundMoney(sum(operating, 'budgeted', 'income') - sum(operating, 'budgeted', 'expense')),
      actual_net: roundMoney(sum(operating, 'actual', 'income') - sum(operating, 'actual', 'expense')),
      uncategorized_income: uncategorized.income,
      uncategorized_expense: uncategorized.expense,
    },
  };
}

function calendarDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

/** Three months of the fixed bills. Fund transfers are not part of that cost. */
async function generalFundReserve(tenantId, monthlyFixed) {
  const general = await db('funds')
    .where({ tenant_id: tenantId, is_active: true })
    .whereRaw("name ILIKE 'general fund'")
    .first();
  const balance = roundMoney(general ? general.current_balance : 0);
  const target = roundMoney(monthlyFixed * 3);
  return {
    id: general ? general.id : null,
    name: general ? general.name : 'General Fund',
    balance,
    monthly_fixed: roundMoney(monthlyFixed),
    months: 3,
    target,
    difference: roundMoney(balance - target),
  };
}

/**
 * Set-aside funds for the budget page. General Fund is the checking pool,
 * so it is not repeated here. Debits are expenses booked to the fund, or
 * categorized to the matching budget line.
 */
async function fundActivity(tenantId, startDate, endDate) {
  const funds = await db('funds')
    .where({ tenant_id: tenantId, is_active: true })
    .whereRaw("name NOT ILIKE 'general fund'")
    .select('id', 'name', 'description', 'current_balance', 'is_restricted');

  if (!funds.length) return [];

  const transfers = await db('recurring_transfers')
    .where({ tenant_id: tenantId, is_active: true })
    .select('to_fund_id', 'amount', 'description', 'day_of_month');

  const addedRows = await db('fund_transactions')
    .whereIn('type', ['transfer_in', 'contribution'])
    .whereIn('fund_id', funds.map((fund) => fund.id))
    .whereBetween('date', [startDate, endDate])
    .groupBy('fund_id')
    .select('fund_id')
    .sum('amount as total');
  const addedByFund = new Map(addedRows.map((row) => [Number(row.fund_id), roundMoney(row.total)]));

  const categories = await db('categories')
    .where({ tenant_id: tenantId, type: 'expense', is_active: true })
    .select('id', 'name');
  const categoryFund = new Map();
  categories.forEach((category) => {
    const fund = funds.find((item) => categoryCoveredByFund(category.name, item.name));
    if (fund) categoryFund.set(Number(category.id), Number(fund.id));
  });

  const expenses = await db('transactions')
    .where({ tenant_id: tenantId, type: 'expense' })
    .whereNot('status', 'void')
    .whereBetween('date', [startDate, endDate])
    .where(function matchFundOrCategory() {
      this.whereIn('fund_id', funds.map((fund) => fund.id));
      const categoryIds = [...categoryFund.keys()];
      if (categoryIds.length) this.orWhereIn('category_id', categoryIds);
    })
    .select('id', 'fund_id', 'category_id', 'date', 'description', 'payee_payer', 'amount', 'check_number')
    .orderBy('date');

  const debitsByFund = new Map();
  const seen = new Set();
  expenses.forEach((txn) => {
    if (seen.has(txn.id)) return;
    const assigned = funds.some((fund) => Number(fund.id) === Number(txn.fund_id))
      ? Number(txn.fund_id)
      : categoryFund.get(Number(txn.category_id));
    if (!assigned) return;
    seen.add(txn.id);
    if (!debitsByFund.has(assigned)) debitsByFund.set(assigned, []);
    debitsByFund.get(assigned).push({
      id: txn.id,
      date: calendarDate(txn.date),
      description: txn.description,
      payee: txn.payee_payer || null,
      check_number: txn.check_number || null,
      amount: roundMoney(txn.amount),
    });
  });

  return funds
    .map((fund) => {
      const monthly = transfers
        .filter((transfer) => Number(transfer.to_fund_id) === Number(fund.id))
        .reduce((sum, transfer) => sum + (parseFloat(transfer.amount) || 0), 0);
      const transfer = transfers.find((item) => Number(item.to_fund_id) === Number(fund.id));
      const debits = debitsByFund.get(Number(fund.id)) || [];
      const added = addedByFund.get(Number(fund.id)) || 0;
      const spent = roundMoney(debits.reduce((sum, debit) => sum + debit.amount, 0));
      return {
        id: fund.id,
        name: fund.name,
        description: fund.description || '',
        balance: roundMoney(fund.current_balance),
        monthly_transfer: roundMoney(monthly),
        transfer_day: transfer ? transfer.day_of_month : null,
        added_this_month: added,
        spent,
        change: roundMoney(added - spent),
        debits,
      };
    })
    .filter((fund) => fund.monthly_transfer > 0 || fund.added_this_month > 0 || fund.spent > 0 || Math.abs(fund.balance) > 0.009)
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}

function currentMonth(now = new Date()) {
  return Number(todayInTimeZone(undefined, now).slice(5, 7));
}

module.exports = {
  monthEndDate,
  loadTransferCoverage,
  budgetSnapshot,
  fundActivity,
  currentMonth,
};
