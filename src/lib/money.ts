export interface MoneyFormat {
  /** 1,23,456.00 style with symbol. */
  full(minor: number): string;
  /** Short form for charts and tiles: ₹1.2L, $3.4K. */
  compact(minor: number): string;
  symbol: string;
}

export function moneyFormat(currency: string, locale: string): MoneyFormat {
  let full: Intl.NumberFormat;
  let fullPaise: Intl.NumberFormat;
  let compact: Intl.NumberFormat;
  try {
    full = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
    fullPaise = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    compact = new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
  } catch {
    full = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    fullPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
    compact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact' });
  }
  const symbol = full.formatToParts(0).find((p) => p.type === 'currency')?.value ?? '';
  return {
    // `|| 0` turns -0 into 0, so a zero balance never shows as "-₹0".
    // Whole amounts without decimals (₹4,290); anything with paise gets both digits (₹8,005.90).
    full: (m) => (m % 100 === 0 ? full : fullPaise).format(m / 100 || 0),
    compact: (m) => compact.format(m / 100 || 0),
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

/**
 * Parses a balance, which unlike an amount can be zero or negative (money owed on a card).
 * Empty means zero. Returns null for anything that isn't a number.
 */
export function toBalance(input: string): number | null {
  const clean = input.replace(/[,\s_]/g, '');
  if (clean === '' || clean === '-') return 0;
  if (!/^-?\d*(\.\d{0,2})?$/.test(clean) || clean === '.' || clean === '-.') return null;
  const minor = Math.round(parseFloat(clean) * 100);
  return Object.is(minor, -0) ? 0 : minor;
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
