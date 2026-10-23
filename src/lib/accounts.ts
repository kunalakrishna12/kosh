import { accountBalances } from './analytics';
import { advance } from './bills';
import { addDays, isoDate, lastMonths, today } from './dates';
import type { Account, Book, Move, Sip, VaultData } from './types';

export const ACCOUNT_COLORS = ['#3b82f6', '#16a394', '#d9822b', '#7c6cff', '#d6455d', '#0891b2', '#65a30d', '#c026d3'];

const KIND_ORDER = { current: 0, savings: 1, card: 2, wallet: 3, cash: 4, deposit: 5, investment: 6 };

export function activeAccounts(data: VaultData, book?: Book): Account[] {
  return data.accounts.filter((a) => !a.archived && (!book || a.book === book)).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name));
}

/** The account you most recently used in this book, so new entries land there by default. */
export function defaultAccountId(data: VaultData, book: Book): string | undefined {
  const ids = new Set(activeAccounts(data, book).map((a) => a.id));
  let best: { id: string; at: number } | undefined;
  for (const t of data.transactions) {
    if (t.accountId && ids.has(t.accountId) && (!best || t.createdAt > best.at)) best = { id: t.accountId, at: t.createdAt };
  }
  return best?.id ?? activeAccounts(data, book)[0]?.id;
}

/** "50200071234567" → "•••• 4567" */
export function masked(number: string): string {
  const digits = number.replace(/\s/g, '');
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : digits;
}

/** Month-end balances for the last `n` months, for sparklines. */
export function balanceHistory(data: VaultData, accountId: string, n = 6): number[] {
  return lastMonths(n).map((key) => {
    const [y, m] = key.split('-').map(Number);
    const end = isoDate(new Date(y, m, 0));
    return accountBalances(data, end < isoDate(new Date()) ? end : isoDate(new Date())).byAccount.get(accountId) ?? 0;
  });
}

/** Finds the account a bank statement belongs to from the account number printed in its header. */
export function accountFromStatement(data: VaultData, headerRows: string[][]): Account | undefined {
  const text = headerRows.flat().join(' ').replace(/\s/g, '');
  return data.accounts.find((a) => {
    const n = a.number.replace(/\s/g, '');
    return n.length >= 4 && (text.includes(n) || new RegExp(`[X*x]+${n.slice(-4)}`).test(text));
  });
}

/* ───────── Investments & SIPs ───────── */

export interface InvestmentStats {
  /** Money you put in (opening amount plus everything moved in, minus withdrawals). */
  invested: number;
  /** What it's worth: the account balance, including value updates. */
  value: number;
  gain: number;
  /** gain / invested */
  returnPct: number | null;
}

/** Value updates are stored as adjustment entries, so invested = value − adjustments. */
export function investmentStats(data: VaultData, accountId: string, asOf = today()): InvestmentStats {
  const value = accountBalances(data, asOf).byAccount.get(accountId) ?? 0;
  const gain = data.transactions
    .filter((t) => t.accountId === accountId && t.adjustment && t.date <= asOf)
    .reduce((s, t) => s + (t.kind === 'income' ? t.amount : -t.amount), 0);
  const invested = value - gain;
  return { invested, value, gain, returnPct: invested > 0 ? gain / invested : null };
}

export function investmentTotals(data: VaultData, book?: Book): InvestmentStats {
  const t = { invested: 0, value: 0, gain: 0 };
  for (const a of activeAccounts(data, book).filter((x) => x.kind === 'investment')) {
    const s = investmentStats(data, a.id);
    t.invested += s.invested;
    t.value += s.value;
    t.gain += s.gain;
  }
  return { ...t, returnPct: t.invested > 0 ? t.gain / t.invested : null };
}

/** Active SIPs due on or before `until` (overdue ones included). */
export function sipsDue(data: VaultData, until = addDays(today(), 7)): Sip[] {
  return data.sips.filter((s) => s.active && s.nextDue <= until).sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1));
}

/** Monthly equivalent of all active SIPs. */
export function monthlySipTotal(data: VaultData): number {
  const per = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3 };
  return Math.round(data.sips.filter((s) => s.active).reduce((sum, s) => sum + s.amount * per[s.frequency], 0));
}

/** Records one SIP instalment as a move and rolls the SIP to its next date. */
export function paySip(data: VaultData, sip: Sip, date: string, amount = sip.amount): VaultData {
  const fund = data.accounts.find((a) => a.id === sip.toAccountId);
  const move: Move = { id: crypto.randomUUID(), from: sip.fromAccountId, to: sip.toAccountId, amount, date, note: `SIP · ${sip.name || fund?.name || 'investment'}`, sipId: sip.id, createdAt: Date.now() };
  return { ...data, moves: [move, ...data.moves], sips: data.sips.map((s) => (s.id === sip.id ? { ...s, nextDue: advance(s.nextDue, s.frequency) } : s)) };
}
