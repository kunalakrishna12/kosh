import { plLines } from './analytics';
import { occurrences } from './bills';
import { isoDate, lastMonths, parseDate, today } from './dates';
import type { Book, Budget, VaultData } from './types';

export interface BudgetStatus {
  budget: Budget;
  spent: number;
  /** spent / limit */
  used: number;
  /** Where spending lands by month end at the current daily pace. */
  projected: number;
  /** What can still be spent per remaining day without going over. */
  perDayLeft: number;
  state: 'ok' | 'pace' | 'near' | 'over';
}

/** Round to whole rupees/dollars: allowances and projections don't need paise. */
const whole = (minor: number) => Math.round(minor / 100) * 100;

/**
 * What usually gets spent after `day` in a month, averaged over the three months before `month`.
 * Real spending is lumpy (rent, payroll, EMIs land on fixed days), so this beats stretching
 * the month-to-date total evenly. Returns null when there's no history to go on.
 */
export function usualRestOfMonth(data: VaultData, book: Book, month: string, day: number, category?: string): number | null {
  const prior = lastMonths(4, `${month}-01`).slice(0, 3);
  const lines = plLines(data).filter((l) => l.book === book && l.kind === 'expense' && (!category || l.category === category));
  const withData = prior.filter((m) => lines.some((l) => l.date.startsWith(m)));
  if (!withData.length) return null;
  const total = lines.filter((l) => withData.includes(l.date.slice(0, 7)) && Number(l.date.slice(8)) > day).reduce((s, l) => s + l.amount, 0);
  return total / withData.length;
}

/** Budget progress for the month containing `t`. */
export function budgetStatus(data: VaultData, month = today().slice(0, 7), t = today()): BudgetStatus[] {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrent = t.startsWith(month);
  const dayOfMonth = isCurrent ? parseDate(t).getDate() : daysInMonth;
  const spentBy = new Map<string, number>();
  for (const l of plLines(data)) {
    if (l.kind === 'expense' && l.date.startsWith(month)) spentBy.set(`${l.book}:${l.category}`, (spentBy.get(`${l.book}:${l.category}`) ?? 0) + l.amount);
  }
  return data.budgets.map((budget) => {
    const spent = spentBy.get(`${budget.book}:${budget.category}`) ?? 0;
    const used = budget.amount ? spent / budget.amount : 0;
    const usual = isCurrent ? usualRestOfMonth(data, budget.book, month, dayOfMonth, budget.category) : null;
    const projected = !isCurrent ? spent : whole(usual !== null ? spent + usual : (spent / dayOfMonth) * daysInMonth);
    const daysLeft = daysInMonth - dayOfMonth + 1;
    const perDayLeft = isCurrent ? whole(Math.max(0, (budget.amount - spent) / daysLeft)) : 0;
    const state = used > 1 ? 'over' : used >= 0.9 ? 'near' : projected > budget.amount * 1.05 && dayOfMonth >= 7 ? 'pace' : 'ok';
    return { budget, spent, used, projected, perDayLeft, state };
  });
}

/**
 * Budget suggestions: the average of the last three full months per category,
 * rounded up to a tidy number, for categories that don't have a budget yet.
 */
export function suggestBudgets(data: VaultData, book: Book, t = today()): { category: string; amount: number }[] {
  const months = new Set(lastMonths(4, t).slice(0, 3));
  const sums = new Map<string, number>();
  for (const l of plLines(data)) {
    if (l.book === book && l.kind === 'expense' && months.has(l.date.slice(0, 7))) sums.set(l.category, (sums.get(l.category) ?? 0) + l.amount);
  }
  const taken = new Set(data.budgets.filter((b) => b.book === book).map((b) => b.category));
  return [...sums.entries()]
    .filter(([c]) => !taken.has(c))
    .map(([category, total]) => {
      const avg = total / 3;
      const step = avg > 10_00_000_00 ? 1_00_000_00 : avg > 1_00_000_00 ? 10_000_00 : avg > 10_000_00 ? 1_000_00 : 100_00;
      return { category, amount: Math.ceil(avg / step) * step };
    })
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/* ───────── The overall monthly budget ───────── */

function monthInfo(month: string, t: string) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrent = t.startsWith(month);
  const dayOfMonth = isCurrent ? parseDate(t).getDate() : month < t.slice(0, 7) ? daysInMonth : 0;
  return { daysInMonth, isCurrent, dayOfMonth, end: isoDate(new Date(y, m, 0)) };
}

/** Every expense in a book for a month (bills and salary included; moves, SIPs and value changes are not spending). */
export function monthSpend(data: VaultData, book: Book, month: string): number {
  return plLines(data)
    .filter((l) => l.book === book && l.kind === 'expense' && l.date.startsWith(month))
    .reduce((s, l) => s + l.amount, 0);
}

export interface OverallStatus {
  limit: number;
  spent: number;
  used: number;
  /** Bills still to be paid this month (overdue ones included). */
  committed: number;
  /** limit − spent − committed */
  safeToSpend: number;
  perDayLeft: number;
  daysLeft: number;
  projected: number;
  state: 'ok' | 'pace' | 'near' | 'over';
}

export function overallStatus(data: VaultData, book: Book, month = today().slice(0, 7), t = today()): OverallStatus {
  const limit = data.settings.monthlyBudget[book];
  const { daysInMonth, isCurrent, dayOfMonth, end } = monthInfo(month, t);
  const spent = monthSpend(data, book, month);
  const committed = isCurrent ? occurrences(data.bills.filter((b) => b.book === book), t, end).reduce((s, o) => s + o.bill.amount, 0) : 0;
  const daysLeft = isCurrent ? daysInMonth - dayOfMonth + 1 : 0;
  const safeToSpend = limit - spent - committed;
  const usual = isCurrent ? usualRestOfMonth(data, book, month, dayOfMonth) : null;
  const projected = !isCurrent || !dayOfMonth ? spent : whole(spent + Math.max(committed, usual ?? (spent / dayOfMonth) * (daysInMonth - dayOfMonth)));
  const used = limit ? spent / limit : 0;
  const state = used > 1 ? 'over' : used >= 0.9 || (isCurrent && safeToSpend < 0) ? 'near' : isCurrent && dayOfMonth >= 7 && projected > limit * 1.05 ? 'pace' : 'ok';
  return { limit, spent, used, committed, safeToSpend, perDayLeft: daysLeft ? whole(Math.max(0, safeToSpend / daysLeft)) : 0, daysLeft, projected, state };
}

/** Cumulative spending by day, next to an even pace that ends exactly at the budget. */
export function dailyBurn(data: VaultData, book: Book, month = today().slice(0, 7), t = today()) {
  const { daysInMonth, dayOfMonth } = monthInfo(month, t);
  const perDay = new Array(daysInMonth).fill(0);
  for (const l of plLines(data)) {
    if (l.book === book && l.kind === 'expense' && l.date.startsWith(month)) perDay[Number(l.date.slice(8)) - 1] += l.amount;
  }
  let run = 0;
  const limit = data.settings.monthlyBudget[book];
  return perDay.map((v, i) => {
    run += v;
    return { day: i + 1, spent: i < dayOfMonth ? run : null, pace: limit ? Math.round((limit * (i + 1)) / daysInMonth) : null };
  });
}

/** The last `n` months of spending against the monthly budget. */
export function budgetHistory(data: VaultData, book: Book, n = 6, t = today()) {
  return lastMonths(n, t).map((month) => ({ month, spent: monthSpend(data, book, month), limit: data.settings.monthlyBudget[book] }));
}

/** Spending this month in categories that have no budget of their own. */
export function unbudgeted(data: VaultData, book: Book, month = today().slice(0, 7)): { category: string; amount: number }[] {
  const has = new Set(data.budgets.filter((b) => b.book === book).map((b) => b.category));
  const sums = new Map<string, number>();
  for (const l of plLines(data)) {
    if (l.book === book && l.kind === 'expense' && l.date.startsWith(month) && !has.has(l.category)) sums.set(l.category, (sums.get(l.category) ?? 0) + l.amount);
  }
  return [...sums.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

/** A starting point for the overall budget: average monthly spend over the last three full months, rounded up. */
export function suggestOverall(data: VaultData, book: Book, t = today()): number {
  const avg = lastMonths(4, t).slice(0, 3).reduce((s, m) => s + monthSpend(data, book, m), 0) / 3;
  const step = avg > 1_00_000_00 ? 10_000_00 : 1_000_00;
  return Math.ceil(avg / step) * step;
}

export interface EntryImpact {
  category?: { name: string; spent: number; limit: number };
  overall?: { spent: number; limit: number };
}

/**
 * What a new or edited expense does to its budgets, for a warning before it's saved.
 * `previous` is the entry being edited, so its old amount isn't counted twice.
 */
export function entryImpact(
  data: VaultData,
  e: { book: Book; category: string; amount: number; date: string },
  previous?: { book: Book; category: string; amount: number; date: string; kind: string },
): EntryImpact {
  const month = e.date.slice(0, 7);
  const sameMonth = previous && previous.kind === 'expense' && previous.book === e.book && previous.date.startsWith(month);
  const out: EntryImpact = {};
  const b = data.budgets.find((x) => x.book === e.book && x.category === e.category);
  if (b) {
    const already = budgetStatus(data, month).find((s) => s.budget.id === b.id)?.spent ?? 0;
    const minus = sameMonth && previous.category === e.category ? previous.amount : 0;
    out.category = { name: e.category, spent: already - minus + e.amount, limit: b.amount };
  }
  const limit = data.settings.monthlyBudget[e.book];
  if (limit) out.overall = { spent: monthSpend(data, e.book, month) - (sameMonth ? previous.amount : 0) + e.amount, limit };
  return out;
}
