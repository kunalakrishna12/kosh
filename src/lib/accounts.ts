import { accountBalances } from './analytics';
import { isoDate, lastMonths } from './dates';
import type { Account, Book, VaultData } from './types';

export const ACCOUNT_COLORS = ['#3b82f6', '#16a394', '#d9822b', '#7c6cff', '#d6455d', '#0891b2', '#65a30d', '#c026d3'];

const KIND_ORDER = { current: 0, savings: 1, card: 2, wallet: 3, cash: 4, deposit: 5 };

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
