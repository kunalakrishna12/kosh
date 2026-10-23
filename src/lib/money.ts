export interface MoneyFormat {
  /** 1,23,456.00 style with symbol. */
  full(minor: number): string;
  /** Short form for charts and tiles: ₹1.2L, $3.4K. */
  compact(minor: number): string;
  symbol: string;
}

export function moneyFormat(currency: string, locale: string): MoneyFormat {
  let full: Intl.NumberFormat;
  let compact: Intl.NumberFormat;
  try {
    full = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 });
    compact = new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
  } catch {
    full = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
    compact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact' });
  }
  const symbol = full.formatToParts(0).find((p) => p.type === 'currency')?.value ?? '';
  return {
    full: (m) => full.format(m / 100),
    compact: (m) => compact.format(m / 100),
    symbol,
  };
}

/** Parses "1,250.50" into minor units. Returns null for anything that is not a positive amount. */
export function toMinor(input: string): number | null {
  const clean = input.replace(/[,\s_]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const minor = Math.round(parseFloat(clean) * 100);
  return minor > 0 ? minor : null;
}

export function toInput(minor: number): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

export const CURRENCIES: { code: string; locale: string; label: string }[] = [
  { code: 'INR', locale: 'en-IN', label: 'Indian Rupee' },
  { code: 'USD', locale: 'en-US', label: 'US Dollar' },
  { code: 'EUR', locale: 'de-DE', label: 'Euro' },
  { code: 'GBP', locale: 'en-GB', label: 'British Pound' },
  { code: 'AED', locale: 'en-AE', label: 'UAE Dirham' },
  { code: 'SGD', locale: 'en-SG', label: 'Singapore Dollar' },
  { code: 'AUD', locale: 'en-AU', label: 'Australian Dollar' },
  { code: 'CAD', locale: 'en-CA', label: 'Canadian Dollar' },
  { code: 'JPY', locale: 'ja-JP', label: 'Japanese Yen' },
];
