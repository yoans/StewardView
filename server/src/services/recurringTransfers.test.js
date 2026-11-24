const test = require('node:test');
const assert = require('node:assert/strict');
const { planTransfer } = require('./recurringTransfers');

const monthly = {
  frequency: 'monthly',
  day_of_month: 1,
  next_run_date: '2026-08-01',
};

test('missed months are skipped and nothing is posted when today is not the due day', () => {
  const plan = planTransfer(monthly, '2026-11-22');
  assert.equal(plan.action, 'skip_missed');
  assert.equal(plan.nextRun, '2026-12-01');
  assert.equal(plan.skipped, 4);
  assert.equal(plan.period, undefined);
});

test('the due day itself still posts, without the months before it', () => {
  const plan = planTransfer(monthly, '2026-12-01');
  assert.equal(plan.action, 'post_today');
  assert.equal(plan.period, '2026-12-01');
  assert.equal(plan.nextRun, '2027-01-01');
  assert.equal(plan.skipped, 4);
});

test('a future schedule waits', () => {
  const plan = planTransfer({ ...monthly, next_run_date: '2026-12-01' }, '2026-11-22');
  assert.equal(plan.action, 'wait');
  assert.equal(plan.nextRun, '2026-12-01');
  assert.equal(plan.skipped, 0);
});
