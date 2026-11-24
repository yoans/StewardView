const test = require('node:test');
const assert = require('node:assert/strict');
const {
  todayInTimeZone,
  initialNextRun,
  enumeratePeriods,
  addDays,
  isoDate,
} = require('./dates');

test('Chicago calendar date is the day before UTC early morning', () => {
  const now = new Date('2026-11-22T03:19:00Z');
  assert.equal(todayInTimeZone('America/Chicago', now), '2026-11-21');
  assert.equal(todayInTimeZone('UTC', now), '2026-11-22');
});

test('a monthly schedule created on its due day waits until next month', () => {
  assert.equal(initialNextRun({
    frequency: 'monthly',
    dayOfMonth: 1,
    today: '2026-11-21',
  }), '2026-12-01');
  assert.equal(initialNextRun({
    frequency: 'monthly',
    dayOfMonth: 1,
    today: '2026-11-01',
  }), '2026-12-01');
});

test('due months include the scheduled day through today', () => {
  const periods = enumeratePeriods('2026-08-01', { frequency: 'monthly', day_of_month: 1 }, addDays('2026-11-22', 1));
  assert.deepEqual(periods, ['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']);
});

test('pg date objects keep the calendar day', () => {
  assert.equal(isoDate(new Date(2026, 7, 1)), '2026-08-01');
  assert.equal(isoDate('2026-08-01T00:00:00.000Z'), '2026-08-01');
});
