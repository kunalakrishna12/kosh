import { plLines } from './analytics';
import { lastMonths, parseDate, today } from './dates';
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
    const projected = isCurrent ? Math.round((spent / dayOfMonth) * daysInMonth) : spent;
    const daysLeft = daysInMonth - dayOfMonth + 1;
    const perDayLeft = isCurrent ? Math.max(0, Math.round((budget.amount - spent) / daysLeft)) : 0;
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
