/**
 * Money helpers. Postgres numeric columns come back as strings, and
 * "2100.00" < "500.00" is true in JavaScript. Always compare in cents.
 */

function toCents(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100);
  }
  const text = String(value).trim().replace(/[$,\s]/g, '');
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text) || text.startsWith('-');
  const numeric = Number(text.replace(/[()]/g, ''));
  if (!Number.isFinite(numeric)) return null;
  const cents = Math.round(Math.abs(numeric) * 100);
  return negative ? -cents : cents;
}

function centsToDecimal(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = String(abs % 100).padStart(2, '0');
  return `${sign}${dollars}.${remainder}`;
}

function formatMoney(value) {
  const cents = toCents(value);
  if (cents == null) return '$0.00';
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const remainder = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}$${dollars}.${remainder}`;
}

function moneyLt(a, b) {
  const left = toCents(a);
  const right = toCents(b);
  if (left == null || right == null) return false;
  return left < right;
}

function moneyEq(a, b) {
  const left = toCents(a);
  const right = toCents(b);
  if (left == null || right == null) return false;
  return left === right;
}

module.exports = {
  toCents,
  centsToDecimal,
  formatMoney,
  moneyLt,
  moneyEq,
};
