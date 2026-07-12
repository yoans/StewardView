/** Format a calendar date for user display (day only, no time/ms). */
export function formatDate(value) {
  if (value == null || value === '') return '—';

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '—';
    // Prefer UTC date parts so midnight-UTC DB dates don't shift a day in local TZ
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const text = String(value).trim();
  const isoDay = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDay) return isoDay[1];

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return text;
}
