const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFundPoints, windowBounds } = require('./fundBalances');

test('a contribution raises the line and it ends at the current balance', () => {
  const points = buildFundPoints([
    { id: 1, date: '2026-02-01', type: 'contribution', amount: 100 },
    { id: 2, date: '2026-03-01', type: 'disbursement', amount: 40 },
  ], 60, '2026-01-01', '2026-04-01');
  assert.deepEqual(points, [
    { date: '2026-01-01', balance: 0 },
    { date: '2026-02-01', balance: 100 },
    { date: '2026-03-01', balance: 60 },
    { date: '2026-04-01', balance: 60 },
  ]);
});

test('money already in the fund before the window stays on the line', () => {
  const points = buildFundPoints([
    { id: 1, date: '2026-01-15', type: 'adjustment_in', amount: 500 },
    { id: 2, date: '2026-06-01', type: 'transfer_out', amount: 100 },
  ], 400, '2026-05-01', '2026-06-30');
  assert.equal(points[0].balance, 500);
  assert.equal(points[points.length - 1].balance, 400);
});

test('year to date starts on January 1', () => {
  assert.deepEqual(windowBounds('ytd', '2026-11-24'), { from: '2026-01-01', to: '2026-11-24' });
});
