const DEFAULT_TIMEZONE = 'America/Chicago';

function appTimeZone() {
  return process.env.APP_TIMEZONE || DEFAULT_TIMEZONE;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Calendar date as YYYY-MM-DD.
 * Date objects from node-pg DATE columns are local midnight, so use local parts.
 * ISO strings use the date prefix and ignore the clock.
 */
function isoDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function todayInTimeZone(timeZone = appTimeZone(), now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(iso, days) {
  const [y, m, d] = isoDate(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function addMonthsClamped(iso, months, dayOfMonth) {
  const [y, m] = isoDate(iso).split('-').map(Number);
  const dom = Math.min(Math.max(Number(dayOfMonth) || 1, 1), 28);
  const zeroBased = (m - 1) + months;
  const year = y + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12 + 1;
  return `${year}-${pad(month)}-${pad(dom)}`;
}

function weekday(iso) {
  const [y, m, d] = isoDate(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function monthKey(iso) {
  return isoDate(iso).slice(0, 7);
}

/**
 * First run date strictly after `today` when today is already the scheduled day.
 * Matches the previous behavior: creating a transfer on its due day waits until
 * the following period, so catching up missed months stays an explicit job.
 */
function initialNextRun({ frequency = 'monthly', dayOfMonth, dayOfWeek, today }) {
  const day = isoDate(today);
  if (frequency === 'weekly') {
    const target = dayOfWeek == null ? 1 : Number(dayOfWeek);
    let cursor = addDays(day, 1);
    for (let i = 0; i < 7; i += 1) {
      if (weekday(cursor) === target) return cursor;
      cursor = addDays(cursor, 1);
    }
    return addDays(day, 7);
  }
  const dom = Math.min(Math.max(Number(dayOfMonth) || 1, 1), 28);
  let candidate = `${day.slice(0, 8)}${pad(dom)}`;
  if (candidate <= day) candidate = addMonthsClamped(candidate, 1, dom);
  return candidate;
}

function advancePeriod(iso, transfer) {
  const day = isoDate(iso);
  if (transfer.frequency === 'weekly') return addDays(day, 7);
  const dom = Math.min(Math.max(Number(transfer.day_of_month) || Number(day.slice(8, 10)), 1), 28);
  return addMonthsClamped(day, 1, dom);
}

/**
 * Period dates from `start` inclusive until `untilExclusive` (date, not month).
 */
function enumeratePeriods(start, transfer, untilExclusive, { limit = 24 } = {}) {
  const end = isoDate(untilExclusive);
  let cursor = isoDate(start);
  const periods = [];
  while (cursor && cursor < end && periods.length < limit) {
    periods.push(cursor);
    const next = advancePeriod(cursor, transfer);
    if (!next || next <= cursor) break;
    cursor = next;
  }
  return periods;
}

function isoToUnixStart(iso) {
  const [y, m, d] = isoDate(iso).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 1000);
}

function unixToIsoDate(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000).toISOString().slice(0, 10);
}

module.exports = {
  DEFAULT_TIMEZONE,
  appTimeZone,
  isoDate,
  todayInTimeZone,
  addDays,
  addMonthsClamped,
  weekday,
  monthKey,
  initialNextRun,
  advancePeriod,
  enumeratePeriods,
  isoToUnixStart,
  unixToIsoDate,
};
