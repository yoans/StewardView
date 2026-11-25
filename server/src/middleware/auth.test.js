const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const { authenticate } = require('./auth');

function run(token) {
  return new Promise((resolve) => {
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {
      status(code) { this.code = code; return this; },
      json(body) { resolve({ code: this.code, body, nextCalled: false }); },
    };
    authenticate(req, res, () => resolve({ nextCalled: true }));
  });
}

test('pre-MFA token cannot be used as a session token', async () => {
  const token = jwt.sign({ id: 1, purpose: 'mfa' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const result = await run(token);
  assert.strictEqual(result.nextCalled, false);
  assert.strictEqual(result.code, 401);
});
