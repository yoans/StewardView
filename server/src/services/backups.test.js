const test = require('node:test');
const assert = require('node:assert');
const { redact, BACKUP_TABLES } = require('./backups');

test('backups strip password hashes from users', () => {
  const rows = [{ id: 1, email: 'a@example.com', password_hash: 'secret' }];
  const out = redact('users', rows);
  assert.strictEqual(out[0].password_hash, undefined);
  assert.strictEqual(out[0].email, 'a@example.com');
  assert.strictEqual(rows[0].password_hash, 'secret', 'original rows untouched');
});

test('backups never include secret-bearing or self-referencing tables', () => {
  for (const t of ['data_backups', 'bank_connections', 'mfa_codes', 'password_reset_tokens', 'user_invite_tokens']) {
    assert.ok(!BACKUP_TABLES.includes(t), `${t} must not be backed up`);
  }
});
