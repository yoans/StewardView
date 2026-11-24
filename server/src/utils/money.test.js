const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, moneyLt, moneyEq, formatMoney } = require('./money');

test('string balances compare numerically, not alphabetically', () => {
  assert.equal(moneyLt('2100.00', '500.00'), false);
  assert.equal(moneyLt('1000.00', '99.00'), false);
  assert.equal(moneyLt('400.00', '500.00'), true);
  assert.equal(moneyLt('500.00', '500.00'), false);
  assert.equal(moneyEq('500.00', 500), true);
  assert.equal(toCents('1,234.50'), 123450);
  assert.equal(formatMoney('2100.5'), '$2,100.50');
});
