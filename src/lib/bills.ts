import { addDays, isoDate, parseDate, today } from './dates';
import type { Bill, BillFrequency, Transaction, VaultData } from './types';

const PER_MONTH: Record<BillFrequency, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

/** The due date one cycle after `date`. A day past the end of a short month is clamped (31 Jan → 28 Feb). */
export function advance(date: string, f: BillFrequency): string {
  if (f === 'weekly') return addDays(date, 7);
  const d = parseDate(date);
  const months = f === 'monthly' ? 1 : f === 'quarterly' ? 3 : 12;
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return isoDate(target);
}

/** What a bill costs per month on average, whatever its cycle. */
export const monthlyCost = (b: Bill) => Math.round(b.amount * PER_MONTH[b.frequency]);

export type BillState = 'overdue' | 'soon' | 'later';

export function billState(b: Bill, t = today()): BillState {
  if (b.nextDue < t) return 'overdue';
  if (b.nextDue <= addDays(t, 7)) return 'soon';
  return 'later';
}

export interface Occurrence {
  bill: Bill;
  date: string;
}

/** Every due date of active bills between `from` and `to`, including repeats and anything overdue. */
export function occurrences(bills: Bill[], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const b of bills) {
    if (!b.active) continue;
    let d = b.nextDue;
    for (let i = 0; d <= to && i < 400; i++) {
      if (d >= from || i === 0) out.push({ bill: b, date: d });
      d = advance(d, b.frequency);
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function paymentsOf(data: VaultData, billId: string): Transaction[] {
  return data.transactions.filter((t) => t.billId === billId).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Change between the last two payments of a bill, e.g. 0.24 for +24%. */
export function priceChange(data: VaultData, billId: string): number | null {
  const [last, prev] = paymentsOf(data, billId);
  if (!last || !prev || !prev.amount) return null;
  return (last.amount - prev.amount) / prev.amount;
}

export interface BillSummary {
  monthly: { personal: number; company: number };
  dueNext30: number;
  overdue: Bill[];
  soon: Bill[];
}

export function billSummary(data: VaultData, t = today()): BillSummary {
  const active = data.bills.filter((b) => b.active);
  const monthly = { personal: 0, company: 0 };
  for (const b of active) monthly[b.book] += monthlyCost(b);
  const dueNext30 = occurrences(active, t, addDays(t, 30)).reduce((s, o) => s + o.bill.amount, 0);
  return {
    monthly,
    dueNext30,
    overdue: active.filter((b) => billState(b, t) === 'overdue'),
    soon: active.filter((b) => billState(b, t) === 'soon'),
  };
}
