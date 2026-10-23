import { balances, flow, monthly, plLines } from './analytics';
import { occurrences } from './bills';
import { addDays, isoDate, lastMonths, monthKey, parseDate, today } from './dates';
import type { Book, VaultData } from './types';

/** The tax already included in a tax-inclusive amount. 1,180 at 18% → 180. */
export const taxPart = (amount: number, rate = 0) => (rate > 0 ? Math.round((amount * rate) / (100 + rate)) : 0);

export interface Period {
  id: string;
  label: string;
  from: string;
  to: string;
}

/** Report periods an accountant asks for: months, quarters and financial years. */
export function periods(fyStartMonth: number, t = today()): Period[] {
  const d = parseDate(t);
  const y = d.getFullYear();
  const m = d.getMonth();
  const monthStart = (yy: number, mm: number) => isoDate(new Date(yy, mm, 1));
  const monthEnd = (yy: number, mm: number) => isoDate(new Date(yy, mm + 1, 0));
  const fyStartYear = m + 1 >= fyStartMonth ? y : y - 1;
  const fy = (start: number) => {
    const from = monthStart(start, fyStartMonth - 1);
    const to = isoDate(new Date(start + 1, fyStartMonth - 1, 0));
    const label = fyStartMonth === 1 ? `FY ${start}` : `FY ${start}–${String(start + 1).slice(2)}`;
    return { from, to, label };
  };
  // Quarters follow the financial year.
  const qIndex = Math.floor(((m - (fyStartMonth - 1) + 12) % 12) / 3);
  const qStartMonth = fyStartMonth - 1 + qIndex * 3;
  const qFrom = new Date(fyStartYear, qStartMonth, 1);
  const prevQFrom = new Date(fyStartYear, qStartMonth - 3, 1);
  const cur = fy(fyStartYear);
  const prev = fy(fyStartYear - 1);
  return [
    { id: 'this-month', label: 'This month', from: monthStart(y, m), to: t },
    { id: 'last-month', label: 'Last month', from: monthStart(y, m - 1), to: monthEnd(y, m - 1) },
    { id: 'this-quarter', label: `This quarter (Q${qIndex + 1})`, from: isoDate(qFrom), to: t },
    { id: 'last-quarter', label: 'Last quarter', from: isoDate(prevQFrom), to: isoDate(new Date(qFrom.getFullYear(), qFrom.getMonth(), 0)) },
    { id: 'this-fy', label: `${cur.label} to date`, from: cur.from, to: t },
    { id: 'last-fy', label: prev.label, from: prev.from, to: prev.to },
    { id: '12m', label: 'Last 12 months', from: addDays(t, -364), to: t },
  ];
}

export interface Statement {
  income: { category: string; amount: number }[];
  expense: { category: string; amount: number }[];
  totalIncome: number;
  totalExpense: number;
  net: number;
  margin: number | null;
}

/** Profit & loss for one book, grouped by category. */
export function statement(data: VaultData, book: Book, from: string, to: string): Statement {
  const inc = new Map<string, number>();
  const exp = new Map<string, number>();
  for (const l of plLines(data)) {
    if (l.book !== book || l.date < from || l.date > to) continue;
    const m = l.kind === 'income' ? inc : exp;
    m.set(l.category, (m.get(l.category) ?? 0) + l.amount);
  }
  const rows = (m: Map<string, number>) => [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  const totalIncome = [...inc.values()].reduce((a, b) => a + b, 0);
  const totalExpense = [...exp.values()].reduce((a, b) => a + b, 0);
  const net = totalIncome - totalExpense;
  return { income: rows(inc), expense: rows(exp), totalIncome, totalExpense, net, margin: totalIncome ? net / totalIncome : null };
}

export interface TaxSummary {
  /** Tax you charged customers (on company income). */
  collected: number;
  /** Tax you paid suppliers (on company expenses), usually claimable as input credit. */
  paid: number;
  /** collected − paid: positive means you owe the tax office. */
  net: number;
  byRate: { rate: number; sales: number; collected: number; purchases: number; paid: number }[];
}

export function taxSummary(data: VaultData, from: string, to: string): TaxSummary {
  const rates = new Map<number, { rate: number; sales: number; collected: number; purchases: number; paid: number }>();
  for (const t of data.transactions) {
    if (t.book !== 'company' || !t.taxRate || t.date < from || t.date > to) continue;
    const r = rates.get(t.taxRate) ?? { rate: t.taxRate, sales: 0, collected: 0, purchases: 0, paid: 0 };
    const tax = taxPart(t.amount, t.taxRate);
    if (t.kind === 'income') {
      r.sales += t.amount - tax;
      r.collected += tax;
    } else {
      r.purchases += t.amount - tax;
      r.paid += tax;
    }
    rates.set(t.taxRate, r);
  }
  const byRate = [...rates.values()].sort((a, b) => a.rate - b.rate);
  const collected = byRate.reduce((s, r) => s + r.collected, 0);
  const paid = byRate.reduce((s, r) => s + r.paid, 0);
  return { collected, paid, net: collected - paid, byRate };
}

export interface ForecastPoint {
  key: string;
  actual: number | null;
  projected: number | null;
}

/**
 * Cash forecast for one book: the last 6 months of real balances, then 6 months
 * projected from average income, average day-to-day spending (anything that is not
 * a bill payment), and the bills actually scheduled in each future month.
 */
export function forecast(data: VaultData, book: Book, ahead = 6, t = today()): { points: ForecastPoint[]; lowest: { key: string; cash: number } | null } {
  const past = lastMonths(6, t);
  const points: ForecastPoint[] = past.map((key) => {
    const end = isoDate(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0));
    return { key, actual: balances(data, end < t ? end : t)[book], projected: null };
  });

  // Averages over the last three full months.
  const window = monthly(data, 4, t).slice(0, 3);
  const avgIncome = window.reduce((s, p) => s + p[book].income, 0) / 3;
  const from3 = `${window[0].key}-01`;
  const to3 = isoDate(new Date(Number(window[2].key.slice(0, 4)), Number(window[2].key.slice(5, 7)), 0));
  const billPaid = data.transactions.filter((x) => x.book === book && x.kind === 'expense' && x.billId && x.date >= from3 && x.date <= to3).reduce((s, x) => s + x.amount, 0);
  const avgOther = Math.max(0, (flow(data, book, from3, to3).expense - billPaid) / 3);

  let cash = balances(data, t)[book];
  points[points.length - 1].projected = cash;
  const bills = data.bills.filter((b) => b.book === book);
  const futureMonths = lastMonths(ahead + 1, isoDate(new Date(parseDate(t).getFullYear(), parseDate(t).getMonth() + ahead, 1))).slice(1);
  // The rest of the current month still has bills to pay.
  const restOfMonth = occurrences(bills, t, isoDate(new Date(parseDate(t).getFullYear(), parseDate(t).getMonth() + 1, 0)));
  const scheduled = (key: string) => occurrences(bills, `${key}-01`, isoDate(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0))).filter((o) => monthKey(o.date) === key);
  let lowest: { key: string; cash: number } | null = null;
  // Includes overdue bills: they still have to be paid.
  cash -= restOfMonth.reduce((s, o) => s + o.bill.amount, 0);
  for (const key of futureMonths) {
    const billsDue = scheduled(key).reduce((s, o) => s + o.bill.amount, 0);
    cash += Math.round(avgIncome - avgOther - billsDue);
    points.push({ key, actual: null, projected: cash });
    if (!lowest || cash < lowest.cash) lowest = { key, cash };
  }
  return { points, lowest };
}
