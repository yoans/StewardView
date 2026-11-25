const test = require('node:test');
const assert = require('node:assert/strict');
const { categorizeAll, DEFAULT_RULES } = require('./categoryRules');
const { categoryCoveredByFund } = require('../utils/fundTransferCategories');

function rules() {
  return DEFAULT_RULES.map((rule, index) => ({ ...rule, category_id: rule.category, id: index + 1 }));
}

test('recurring payees land on the workbook category', () => {
  const rows = [
    { id: 1, type: 'expense', amount: '3611.14', description: 'ELECTRONIC WITHDRAWAL NATPAY-12756380' },
    { id: 2, type: 'expense', amount: '52.25', description: 'ELECTRONIC WITHDRAWAL NATPAY-12756380' },
    { id: 3, type: 'expense', amount: '1143.40', description: 'ELECTRONIC WITHDRAWAL WORKFORCE-MASTER' },
    { id: 4, type: 'expense', amount: '799.37', description: 'WEB AUTHORIZED PMT Church Mutual In' },
    { id: 5, type: 'expense', amount: '287.83', description: 'ELECTRONIC WITHDRAWAL DES MOINES WATER' },
    { id: 6, type: 'expense', amount: '139.54', description: 'WEB AUTHORIZED PMT LumenCenturyLink' },
    { id: 7, type: 'expense', amount: '245.00', description: 'ELECTRONIC WITHDRAWAL Grass Eaters' },
    { id: 8, type: 'income', amount: '833.00', description: 'DEPOSIT' },
    { id: 9, type: 'income', amount: '506.46', description: 'ELECTRONIC DEPOSIT 5/3 BANKCARD SYS' },
    { id: 10, type: 'income', amount: '0.04', description: 'INTEREST PAID THIS PERIOD' },
    { id: 11, type: 'expense', amount: '70.00', description: 'ANALYSIS SERVICE CHARGE' },
  ];
  const decided = categorizeAll(rows, rules());
  assert.equal(decided.get(1), 'Preacher Salary');
  assert.equal(decided.get(2), 'Payroll Service Fee');
  assert.equal(decided.get(3), 'Payroll Taxes');
  assert.equal(decided.get(4), 'Property Insurance');
  assert.equal(decided.get(5), 'Water/Sewer');
  assert.equal(decided.get(6), 'Phone/Internet');
  assert.equal(decided.get(7), 'Grounds');
  assert.equal(decided.get(8), 'General Contributions');
  assert.equal(decided.get(9), 'Online Contributions');
  assert.equal(decided.get(10), 'Interest');
  assert.equal(decided.get(11), 'Other');
});

test('the smaller MidAmerican bill is gas and the larger is electric', () => {
  const rows = [
    { id: 1, type: 'expense', amount: '26.89', date: '2026-11-18', bank_account_id: 1, description: 'Electronic Withdrawal Midamerican' },
    { id: 2, type: 'expense', amount: '86.29', date: '2026-11-18', bank_account_id: 1, description: 'Electronic Withdrawal Midamerican' },
    { id: 3, type: 'expense', amount: '40.00', date: '2026-11-19', bank_account_id: 1, description: 'Electronic Withdrawal Midamerican' },
  ];
  const decided = categorizeAll(rows, rules());
  assert.equal(decided.get(1), 'Gas');
  assert.equal(decided.get(2), 'Electric');
  assert.equal(decided.has(3), false);
});

test('fund transfer destinations are not spending categories', () => {
  assert.equal(categoryCoveredByFund('Buildings', 'Building Fund'), true);
  assert.equal(categoryCoveredByFund('Mission Support', 'Missions Fund'), true);
  assert.equal(categoryCoveredByFund('Youth Programs/Activities', 'Youth Fund'), true);
  assert.equal(categoryCoveredByFund('Benevolence', 'Benevolence Fund'), true);
  assert.equal(categoryCoveredByFund('Grounds', 'Building Fund'), false);
  assert.equal(categoryCoveredByFund('Janitorial Supplies/Services', 'Youth Fund'), false);
  assert.equal(categoryCoveredByFund('Electric', 'Building Fund'), false);
  assert.equal(categoryCoveredByFund('Janitorial Supplies/Services', 'Janitorial Fund'), true);
  assert.equal(categoryCoveredByFund('IT Supplies/Services', 'IT Supplies Fund'), true);
  assert.equal(categoryCoveredByFund('Office Supplies', 'Other Fund'), false);
  assert.equal(categoryCoveredByFund('Electric', 'Equipment Fund'), false);
});

test('payee rules for the home church never reach other organizations', () => {
  const { rulesForTenant, GENERIC_RULES } = require('./categoryRules');
  const prev = process.env.HOME_TENANT_ID;
  process.env.HOME_TENANT_ID = '1';
  try {
    assert.ok(rulesForTenant(1).some((r) => r.pattern === 'des moines water'));
    assert.deepEqual(rulesForTenant(2), GENERIC_RULES);
    assert.ok(!rulesForTenant(2).some((r) => r.pattern === 'natpay'));
  } finally {
    if (prev === undefined) delete process.env.HOME_TENANT_ID; else process.env.HOME_TENANT_ID = prev;
  }
});
