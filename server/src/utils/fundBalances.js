const CREDITS = new Set(['contribution', 'transfer_in', 'adjustment_in']);

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function isoDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function signedAmount(type, amount) {
  const value = Math.abs(Number(amount) || 0);
  return CREDITS.has(type) ? value : -value;
}

function shiftMonths(iso, months) {
  const [year, month, day] = iso.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, day));
  const nextMonth = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(shifted.getUTCDate()).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${nextMonth}-${nextDay}`;
}

function windowBounds(windowId, today) {
  if (windowId === 'all') return { from: null, to: today };
  if (windowId === 'ytd') return { from: `${today.slice(0, 4)}-01-01`, to: today };
  const months = { '3m': -3, '6m': -6, '1y': -12 }[windowId] ?? -12;
  return { from: shiftMonths(today, months), to: today };
}

/**
 * Daily ending balances for one fund. The line ends at the current balance.
 * Movement the ledger does not explain is treated as the opening balance.
 */
function buildFundPoints(rows, currentBalance, from, to) {
  const ordered = [...(rows || [])].sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)) || (Number(a.id) || 0) - (Number(b.id) || 0));
  const movement = ordered.reduce((sum, row) => sum + signedAmount(row.type, row.amount), 0);
  const opening = roundMoney(currentBalance - movement);
  let running = opening;
  let startBalance = opening;
  const dayEnd = new Map();

  ordered.forEach((row) => {
    const date = isoDate(row.date);
    if (!date) return;
    running = roundMoney(running + signedAmount(row.type, row.amount));
    if (from && date < from) startBalance = running;
    else if (!to || date <= to) dayEnd.set(date, running);
  });

  const start = from || (ordered[0] ? isoDate(ordered[0].date) : to);
  const end = to || start;
  const points = [{ date: start, balance: from ? startBalance : opening }];
  [...dayEnd.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([date, balance]) => {
      points.push({ date, balance });
    });
  const last = points[points.length - 1];
  if (end && last.date !== end) points.push({ date: end, balance: last.balance });
  return points;
}

module.exports = {
  roundMoney,
  isoDate,
  signedAmount,
  windowBounds,
  buildFundPoints,
};
