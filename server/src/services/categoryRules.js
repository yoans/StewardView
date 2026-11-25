/**
 * Decide a category for transactions that always post the same way.
 * Rules never overwrite a category that is already set; callers pass only
 * uncategorized rows. Same-day rank rules (electric vs gas) need the whole
 * day's matching rows, so they are resolved together.
 */

function squash(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function haystack(txn) {
  return squash([txn.description, txn.payee_payer, txn.payee, txn.memo].filter(Boolean).join(' '));
}

function amountOf(txn) {
  const n = Math.abs(parseFloat(txn.amount));
  return Number.isFinite(n) ? n : null;
}

function ruleMatches(rule, txn) {
  if (rule.transaction_type && txn.type && rule.transaction_type !== txn.type) return false;
  const amount = amountOf(txn);
  if (rule.min_amount != null && (amount == null || amount + 0.001 < Number(rule.min_amount))) return false;
  if (rule.max_amount != null && (amount == null || amount - 0.001 > Number(rule.max_amount))) return false;
  const pattern = squash(rule.pattern);
  if (!pattern) return false;
  if (rule.match_mode === 'exact') return squash(txn.description) === pattern;
  return haystack(txn).includes(pattern);
}

function dayKey(txn) {
  const raw = txn.date instanceof Date ? txn.date.toISOString() : String(txn.date || '');
  return `${txn.bank_account_id || ''}|${raw.slice(0, 10)}`;
}

/**
 * @returns {Map<number|string, *>} transaction id → category id
 */
function categorizeAll(transactions, rules) {
  const txns = Array.isArray(transactions) ? transactions : [];
  const ordered = [...(rules || [])].sort((a, b) => (a.priority || 0) - (b.priority || 0));
  const decided = new Map();

  for (const rule of ordered) {
    const pool = txns.filter((txn) => txn && txn.id != null && !decided.has(txn.id) && ruleMatches(rule, txn));
    if (rule.day_rank === 'lowest' || rule.day_rank === 'highest') {
      const groups = new Map();
      for (const txn of txns.filter((txn) => txn && ruleMatches(rule, txn))) {
        const key = dayKey(txn);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(txn);
      }
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const amounts = group.map(amountOf).filter((n) => n != null);
        if (!amounts.length) continue;
        const target = rule.day_rank === 'lowest' ? Math.min(...amounts) : Math.max(...amounts);
        const hits = group.filter((txn) => amountOf(txn) === target && !decided.has(txn.id));
        if (hits.length !== 1) continue;
        decided.set(hits[0].id, rule.category_id);
      }
      continue;
    }
    for (const txn of pool) decided.set(txn.id, rule.category_id);
  }

  return decided;
}

// Bank descriptions that mean the same thing at almost any organization.
const GENERIC_RULES = [
  { pattern: 'deposit', match_mode: 'exact', transaction_type: 'income', category: 'General Contributions', priority: 10 },
  { pattern: 'givelify', transaction_type: 'income', category: 'Online Contributions', priority: 20 },
  { pattern: 'interest', transaction_type: 'income', category: 'Interest', priority: 30 },
  { pattern: 'analysis service charge', transaction_type: 'expense', category: 'Other', priority: 180 },
];

// Payees specific to the home church's own bank statements (see utils/homeTenant).
const HOME_CHURCH_RULES = [
  { pattern: '5/3', transaction_type: 'income', category: 'Online Contributions', priority: 21 },
  { pattern: 'natpay', transaction_type: 'expense', min_amount: 500, category: 'Preacher Salary', priority: 100 },
  { pattern: 'natpay', transaction_type: 'expense', max_amount: 499.99, category: 'Payroll Service Fee', priority: 110 },
  { pattern: 'workforce', transaction_type: 'expense', category: 'Payroll Taxes', priority: 120 },
  { pattern: 'church mutual', transaction_type: 'expense', category: 'Property Insurance', priority: 130 },
  { pattern: 'des moines water', transaction_type: 'expense', category: 'Water/Sewer', priority: 140 },
  { pattern: 'centurylink', transaction_type: 'expense', category: 'Phone/Internet', priority: 150 },
  { pattern: 'lumen', transaction_type: 'expense', category: 'Phone/Internet', priority: 151 },
  { pattern: 'grass eaters', transaction_type: 'expense', category: 'Grounds', priority: 160 },
  { pattern: 'midamerican', transaction_type: 'expense', day_rank: 'highest', category: 'Electric', priority: 170 },
  { pattern: 'midamerican', transaction_type: 'expense', day_rank: 'lowest', category: 'Gas', priority: 171 },
];

const DEFAULT_RULES = [...GENERIC_RULES, ...HOME_CHURCH_RULES].sort((a, b) => a.priority - b.priority);

/** Starter rules for a tenant: generic for everyone, plus payee rules for the home church. */
function rulesForTenant(tenantId) {
  const { isHomeTenant } = require('../utils/homeTenant');
  return isHomeTenant(tenantId) ? DEFAULT_RULES : GENERIC_RULES;
}

/** Rule definitions → category_rules rows, skipping rules whose category the tenant lacks. */
function buildRuleRows(defs, tenantId, idByName) {
  const rows = [];
  for (const rule of defs) {
    const categoryId = idByName.get(rule.category.toLowerCase());
    if (!categoryId) continue;
    rows.push({
      tenant_id: tenantId,
      pattern: rule.pattern,
      match_mode: rule.match_mode || 'contains',
      transaction_type: rule.transaction_type || null,
      min_amount: rule.min_amount == null ? null : rule.min_amount,
      max_amount: rule.max_amount == null ? null : rule.max_amount,
      day_rank: rule.day_rank || null,
      category_id: categoryId,
      priority: rule.priority || 100,
      is_active: true,
    });
  }
  return rows;
}

module.exports = {
  squash,
  ruleMatches,
  categorizeAll,
  DEFAULT_RULES,
  GENERIC_RULES,
  HOME_CHURCH_RULES,
  rulesForTenant,
  buildRuleRows,
};
