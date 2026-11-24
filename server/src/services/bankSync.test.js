const test = require('node:test');
const assert = require('node:assert/strict');
const { syncWindow, signedAmount } = require('./bankSync');

test('the first sync looks back 90 days and later syncs overlap five days', () => {
  assert.deepEqual(syncWindow(null, '2026-11-22'), {
    start: '2026-08-25',
    end: '2026-11-23',
  });
  assert.deepEqual(syncWindow('2026-11-20T12:00:00Z', '2026-11-22'), {
    start: '2026-11-15',
    end: '2026-11-23',
  });
});

test('SimpleFIN amounts keep their sign as income or expense', () => {
  assert.deepEqual(signedAmount({ amount: '-12.34' }), { type: 'expense', amount: '12.34' });
  assert.deepEqual(signedAmount({ amount: '80.00' }), { type: 'income', amount: '80.00' });
  assert.equal(signedAmount({ amount: '0.00' }), null);
});
