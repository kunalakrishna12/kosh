import type { Fx, VaultData } from './types';

export const FOREIGN_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];

/** Most Indian debit and credit cards charge 3.5% on foreign spends, plus 18% GST on that fee. */
export const DEFAULT_MARKUP = 4.13;

/** What a foreign amount costs in your currency, fee included (minor units in, minor units out). */
export function fxToBase(fx: Pick<Fx, 'amount' | 'rate' | 'markup'>): number {
  return Math.round(fx.amount * fx.rate * (1 + fx.markup / 100));
}

/** The market rate implied by what your statement actually charged: lets estimates learn from real payments. */
export function impliedRate(chargedMinor: number, fx: Pick<Fx, 'amount' | 'markup'>): number {
  return fx.amount ? Math.round((chargedMinor / (fx.amount * (1 + fx.markup / 100))) * 10_000) / 10_000 : 0;
}

/** The most recent rate you used for this currency anywhere in the vault. */
export function lastKnownRate(data: VaultData, currency: string): number | undefined {
  let best: { at: number; rate: number } | undefined;
  for (const t of data.transactions) if (t.fx?.currency === currency && (!best || t.createdAt > best.at)) best = { at: t.createdAt, rate: t.fx.rate };
  if (best) return best.rate;
  return data.bills.find((b) => b.fx?.currency === currency)?.fx?.rate;
}

/**
 * Today's reference rate from frankfurter.app (European Central Bank data). Only called when you press the
 * button, and only the two currency codes are sent.
 */
export async function fetchRate(from: string, to: string): Promise<number> {
  const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  if (!res.ok) throw new Error(`Rate service answered ${res.status}`);
  const rate = (await res.json())?.rates?.[to];
  if (typeof rate !== 'number' || !(rate > 0)) throw new Error(`No ${from}→${to} rate available`);
  return rate;
}

/** "$20.00", "€9.99": a foreign amount in its own currency. */
export function foreignFmt(currency: string, minor: number): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

/** Form state for a foreign amount. Strings, because they come straight from inputs. */
export interface FxDraft {
  rate: string;
  markup: string;
}

export function parseRate(s: string): number | null {
  const v = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function parseMarkup(s: string): number | null {
  if (s.trim() === '') return 0;
  const v = parseFloat(s);
  return Number.isFinite(v) && v >= 0 && v < 50 ? v : null;
}
