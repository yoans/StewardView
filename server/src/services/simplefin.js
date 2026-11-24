const crypto = require('crypto');

const ALLOWED_HOSTS = new Set([
  'bridge.simplefin.org',
  'beta-bridge.simplefin.org',
]);

function assertAllowedUrl(value) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(String(value));
  } catch {
    throw new Error('SimpleFIN returned an address StewardView cannot use.');
  }
  if (url.protocol !== 'https:') {
    throw new Error('SimpleFIN connections must use HTTPS.');
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error('That setup token does not point at SimpleFIN Bridge.');
  }
  return url;
}

function decodeSetupToken(setupToken) {
  const compact = String(setupToken || '').trim().replace(/\s+/g, '');
  if (!compact || compact.length > 4000) {
    throw new Error('Paste the setup token from SimpleFIN Bridge.');
  }
  const padded = compact.replace(/-/g, '+').replace(/_/g, '/');
  const claim = Buffer.from(padded, 'base64').toString('utf8').trim();
  if (!claim.startsWith('https://')) {
    throw new Error('That setup token could not be read. Copy it again from SimpleFIN.');
  }
  return assertAllowedUrl(claim);
}

function encryptionKey() {
  const secret = process.env.JWT_SECRET || process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error('JWT_SECRET is required to store a bank connection.');
  return crypto.createHash('sha256').update(`stewardview-bank-v1:${secret}`).digest();
}

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptSecret(payload) {
  const buf = Buffer.from(String(payload || ''), 'base64');
  if (buf.length < 29) throw new Error('Stored bank connection is unreadable.');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function redact(text) {
  return String(text || '')
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/[A-Za-z0-9._%+-]+:[^@\s]+@/g, '[redacted]@')
    .slice(0, 500);
}

async function requestAllowlisted(url, options, depth = 0) {
  if (depth > 3) throw new Error('SimpleFIN redirected too many times.');
  const target = assertAllowedUrl(url);
  const response = await fetch(target, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new Error('SimpleFIN redirected without a destination.');
    return requestAllowlisted(new URL(location, target), options, depth + 1);
  }
  return response;
}

async function claimSetupToken(setupToken) {
  const claimUrl = decodeSetupToken(setupToken);
  const response = await requestAllowlisted(claimUrl, {
    method: 'POST',
    headers: { 'Content-Length': '0' },
  });
  const body = (await response.text()).trim();
  if (!response.ok) {
    throw new Error(redact(body) || `SimpleFIN refused the setup token (${response.status}).`);
  }
  const accessUrl = assertAllowedUrl(body);
  if (!accessUrl.username || !accessUrl.password) {
    throw new Error('SimpleFIN did not return a usable access token. Create a new setup token and try again.');
  }
  return accessUrl.toString();
}

function accountsUrl(accessUrl, params) {
  const parsed = assertAllowedUrl(accessUrl);
  const base = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}/`;
  const url = new URL('accounts', base);
  url.searchParams.set('version', '2');
  if (params.start != null) url.searchParams.set('start-date', String(params.start));
  if (params.end != null) url.searchParams.set('end-date', String(params.end));
  return { url, username: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password) };
}

function collectErrors(payload) {
  const messages = [];
  for (const key of ['errors', 'errlist']) {
    const list = payload?.[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item) continue;
      if (typeof item === 'string') messages.push(item);
      else if (item.message || item.description) messages.push(String(item.message || item.description));
    }
  }
  return messages;
}

async function fetchAccounts(accessUrl, { start, end } = {}) {
  const { url, username, password } = accountsUrl(accessUrl, { start, end });
  const response = await requestAllowlisted(url, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  if (text.length > 5_000_000) throw new Error('SimpleFIN returned more data than StewardView will import at once.');
  if (!response.ok) {
    throw new Error(redact(text) || `SimpleFIN account request failed (${response.status}).`);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('SimpleFIN returned something other than account data.');
  }
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  return { accounts, errors: collectErrors(payload) };
}

function publicAccount(account) {
  const org = account.org || {};
  return {
    id: String(account.id || ''),
    name: account.name || 'Bank account',
    org: org.name || org.domain || '',
    currency: account.currency || 'USD',
    balance: account.balance != null ? String(account.balance) : null,
    balance_date: account['balance-date'] || account.balance_date || null,
  };
}

module.exports = {
  ALLOWED_HOSTS,
  assertAllowedUrl,
  decodeSetupToken,
  encryptSecret,
  decryptSecret,
  redact,
  claimSetupToken,
  fetchAccounts,
  publicAccount,
  collectErrors,
};
