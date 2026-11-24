const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeSetupToken, encryptSecret, decryptSecret, redact } = require('./simplefin');

test('setup tokens must be SimpleFIN Bridge https URLs', () => {
  const token = Buffer.from('https://bridge.simplefin.org/simplefin/claim/abc').toString('base64');
  const url = decodeSetupToken(token);
  assert.equal(url.hostname, 'bridge.simplefin.org');

  const evil = Buffer.from('https://example.com/claim').toString('base64');
  assert.throws(() => decodeSetupToken(evil), /SimpleFIN Bridge/);
  assert.throws(() => decodeSetupToken('not-a-token'), /could not be read/);
});

test('access URLs round-trip encrypted and are redacted in errors', () => {
  process.env.JWT_SECRET = 'test-secret';
  const secret = 'https://user:pass@bridge.simplefin.org/simplefin';
  assert.equal(decryptSecret(encryptSecret(secret)), secret);
  assert.equal(redact(`failed ${secret}`).includes('pass'), false);
});
