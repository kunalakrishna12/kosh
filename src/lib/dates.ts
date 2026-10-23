/** Dates are plain local calendar days (YYYY-MM-DD); no time zones involved. */

const pad = (n: number) => String(n).padStart(2, '0');

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return isoDate(new Date());
}

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** The last `n` month keys ending with the month of `end`, oldest first. */
export function lastMonths(n: number, end = today()): string[] {
  const d = parseDate(end);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${pad(m.getMonth() + 1)}`);
  }
  return out;
}

export function monthLabel(key: string, withYear = false): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en', withYear ? { month: 'short', year: '2-digit' } : { month: 'short' });
}

export function dayLabel(iso: string): string {
  const t = today();
  if (iso === t) return 'Today';
  if (iso === addDays(t, -1)) return 'Yesterday';
  const d = parseDate(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function relativeTime(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  const years = days / 365;
  return `${years < 2 ? '1' : Math.floor(years)}y ago`;
}
