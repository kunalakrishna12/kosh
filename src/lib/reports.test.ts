import { describe, expect, it } from 'vitest';
import { advance, billState, monthlyCost, occurrences, priceChange } from './bills';
import { demoVault } from './demo';
import { forecast, periods, statement, taxPart, taxSummary } from './reports';
import { emptyVault, type Bill, type Transaction } from './types';

const bill = (patch: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  book: 'company',
  name: 'AWS',
  vendor: 'Amazon',
  kind: 'cloud',
  amount: 1_000,
  variable: false,
  frequency: 'monthly',
  nextDue: '2026-01-31',
  category: 'Cloud',
  autopay: false,
  active: true,
  notes: '',
  createdAt: 0,
  ...patch,
});

let n = 0;
const tx = (t: Partial<Transaction>): Transaction => ({ id: `t${++n}`, book: 'company', kind: 'expense', amount: 100, category: 'Other', date: '2026-01-10', note: '', createdAt: n, ...t });

describe('bills', () => {
  it('advances due dates and clamps to the end of short months', () => {
    expect(advance('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(advance('2026-11-15', 'quarterly')).toBe('2027-02-15');
    expect(advance('2026-03-01', 'yearly')).toBe('2027-03-01');
    expect(advance('2026-03-01', 'weekly')).toBe('2026-03-08');
  });

  it('normalises any cycle to a monthly cost', () => {
    expect(monthlyCost(bill({ amount: 12_000, frequency: 'yearly' }))).toBe(1_000);
    expect(monthlyCost(bill({ amount: 3_000, frequency: 'quarterly' }))).toBe(1_000);
  });

  it('knows overdue from due soon', () => {
    expect(billState(bill({ nextDue: '2026-01-01' }), '2026-01-05')).toBe('overdue');
    expect(billState(bill({ nextDue: '2026-01-09' }), '2026-01-05')).toBe('soon');
    expect(billState(bill({ nextDue: '2026-02-20' }), '2026-01-05')).toBe('later');
  });

  it('expands repeats inside a window and keeps overdue ones', () => {
    const occ = occurrences([bill({ nextDue: '2026-01-02', frequency: 'weekly' })], '2026-01-05', '2026-01-20');
    expect(occ.map((o) => o.date)).toEqual(['2026-01-02', '2026-01-09', '2026-01-16']);
    expect(occurrences([bill({ active: false })], '2026-01-01', '2026-12-31')).toEqual([]);
  });

  it('measures the change between the last two payments', () => {
    const v = { ...emptyVault(), transactions: [tx({ billId: 'b1', amount: 100, date: '2026-01-01' }), tx({ billId: 'b1', amount: 130, date: '2026-02-01' })] };
    expect(priceChange(v, 'b1')).toBeCloseTo(0.3);
  });
});

describe('tax', () => {
  it('extracts tax from inclusive amounts', () => {
    expect(taxPart(1_180, 18)).toBe(180);
    expect(taxPart(1_000, 0)).toBe(0);
  });

  it('nets output tax against input credit', () => {
    const v = {
      ...emptyVault(),
      transactions: [
        tx({ kind: 'income', amount: 11_800, taxRate: 18 }),
        tx({ kind: 'expense', amount: 5_900, taxRate: 18 }),
        tx({ kind: 'expense', amount: 999 }),
        tx({ book: 'personal', kind: 'expense', amount: 1_180, taxRate: 18 }),
      ],
    };
    const t = taxSummary(v, '2026-01-01', '2026-01-31');
    expect(t.collected).toBe(1_800);
    expect(t.paid).toBe(900);
    expect(t.net).toBe(900);
    expect(t.byRate).toEqual([{ rate: 18, sales: 10_000, collected: 1_800, purchases: 5_000, paid: 900 }]);
  });
});

describe('periods', () => {
  it('follows an April–March financial year', () => {
    const ps = periods(4, '2026-10-23');
    expect(ps.find((p) => p.id === 'this-fy')).toMatchObject({ from: '2026-04-01', to: '2026-10-23', label: 'FY 2026–27 to date' });
    expect(ps.find((p) => p.id === 'last-fy')).toMatchObject({ from: '2025-04-01', to: '2026-03-31' });
    expect(ps.find((p) => p.id === 'this-quarter')).toMatchObject({ from: '2026-10-01', label: 'This quarter (Q3)' });
    expect(ps.find((p) => p.id === 'last-quarter')).toMatchObject({ from: '2026-07-01', to: '2026-09-30' });
  });

  it('handles a January year and early-year dates', () => {
    const ps = periods(1, '2026-02-10');
    expect(ps.find((p) => p.id === 'this-fy')).toMatchObject({ from: '2026-01-01', label: 'FY 2026 to date' });
    expect(ps.find((p) => p.id === 'last-month')).toMatchObject({ from: '2026-01-01', to: '2026-01-31' });
  });
});

describe('statement and forecast', () => {
  it('balances: income − expenses = net', () => {
    const v = demoVault();
    const s = statement(v, 'company', '2000-01-01', '2100-01-01');
    expect(s.totalIncome - s.totalExpense).toBe(s.net);
    expect(s.income.reduce((a, r) => a + r.amount, 0)).toBe(s.totalIncome);
  });

  it('subtracts scheduled bills from projected cash', () => {
    const base = { ...emptyVault(), settings: { ...emptyVault().settings, openingBalance: { personal: 0, company: 10_000 } } };
    const without = forecast(base, 'company', 3, '2026-01-15');
    const withBill = forecast({ ...base, bills: [bill({ amount: 1_000, nextDue: '2026-02-01' })] }, 'company', 3, '2026-01-15');
    const last = (f: typeof without) => f.points[f.points.length - 1].projected!;
    expect(last(without)).toBe(10_000);
    expect(last(withBill)).toBe(10_000 - 3_000);
  });
});
