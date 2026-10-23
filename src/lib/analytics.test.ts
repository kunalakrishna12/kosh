import { describe, expect, it } from 'vitest';
import { balances, flow, projectStats, runway } from './analytics';
import { demoVault } from './demo';
import { emptyVault, type Transaction, type Transfer, type VaultData } from './types';

let n = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'book' | 'kind' | 'amount'>): Transaction => ({
  id: `t${++n}`,
  category: 'Other',
  date: '2026-03-10',
  note: '',
  createdAt: n,
  ...t,
});
const tr = (reason: Transfer['reason'], amount: number, date = '2026-03-01'): Transfer => ({ id: `r${++n}`, reason, amount, date, note: '', createdAt: n });

function vault(patch: Partial<VaultData>): VaultData {
  return { ...emptyVault(), ...patch };
}

describe('balances', () => {
  it('moves cash between pockets for each kind of transfer', () => {
    const v = vault({
      settings: { ...emptyVault().settings, openingBalance: { personal: 100_000, company: 0 } },
      transfers: [tr('capital', 50_000), tr('loan', 20_000), tr('salary', 10_000), tr('repayment', 5_000)],
    });
    const b = balances(v, '2026-12-31');
    expect(b.personal).toBe(100_000 - 50_000 - 20_000 + 10_000 + 5_000);
    expect(b.company).toBe(50_000 + 20_000 - 10_000 - 5_000);
    expect(b.capital).toBe(50_000);
    expect(b.owedToYou).toBe(15_000);
    expect(b.drawnThisYear).toBe(10_000);
  });

  it('charges company bills paid personally to you, and records the debt', () => {
    const v = vault({
      transactions: [tx({ book: 'company', kind: 'expense', amount: 3_000, paidPersonally: true })],
      transfers: [tr('reimbursement', 1_000, '2026-04-01')],
    });
    const b = balances(v, '2026-12-31');
    expect(b.personal).toBe(-3_000 + 1_000);
    expect(b.company).toBe(-1_000);
    expect(b.owedToYou).toBe(2_000);
  });

  it('ignores entries after the as-of date', () => {
    const v = vault({ transactions: [tx({ book: 'personal', kind: 'income', amount: 500, date: '2027-01-01' })] });
    expect(balances(v, '2026-12-31').personal).toBe(0);
  });
});

describe('flow', () => {
  it('counts salary as personal income and company cost, but nets it out across both books', () => {
    const v = vault({
      transactions: [tx({ book: 'company', kind: 'income', amount: 100 })],
      transfers: [tr('salary', 40)],
    });
    expect(flow(v, 'personal')).toEqual({ income: 40, expense: 0 });
    expect(flow(v, 'company')).toEqual({ income: 100, expense: 40 });
    expect(flow(v, 'all')).toEqual({ income: 100, expense: 0 });
  });

  it('does not count capital or loans as income', () => {
    const v = vault({ transfers: [tr('capital', 1_000), tr('loan', 500)] });
    expect(flow(v, 'company')).toEqual({ income: 0, expense: 0 });
  });
});

describe('projects', () => {
  it('computes margin, burn and collection', () => {
    const p = { id: 'p1', name: 'X', client: 'C', contract: 1_000, budget: 400, status: 'active' as const, color: '#fff', startDate: '2026-01-01', createdAt: 0 };
    const v = vault({
      projects: [p],
      transactions: [
        tx({ book: 'company', kind: 'income', amount: 600, projectId: 'p1' }),
        tx({ book: 'company', kind: 'expense', amount: 300, projectId: 'p1' }),
      ],
    });
    const s = projectStats(v, p);
    expect(s.profit).toBe(300);
    expect(s.margin).toBe(0.5);
    expect(s.burn).toBe(0.75);
    expect(s.collected).toBe(0.6);
    expect(s.outstanding).toBe(400);
  });
});

describe('runway', () => {
  it('is null when the company earns more than it spends', () => {
    const v = vault({ transactions: [tx({ book: 'company', kind: 'income', amount: 10_000, date: '2026-02-10' })] });
    expect(runway(v, '2026-04-15').months).toBeNull();
  });

  it('divides cash by average burn over the last three full months', () => {
    const v = vault({
      settings: { ...emptyVault().settings, openingBalance: { personal: 0, company: 9_000 } },
      transactions: ['2026-01-05', '2026-02-05', '2026-03-05'].map((date) => tx({ book: 'company', kind: 'expense', amount: 1_000, date })),
    });
    const r = runway(v, '2026-04-15');
    expect(r.burn).toBe(1_000);
    expect(r.months).toBe(6);
  });
});

describe('demo data', () => {
  it('is internally consistent', () => {
    const v = demoVault();
    expect(v.transactions.length).toBeGreaterThan(100);
    const ids = new Set(v.projects.map((p) => p.id));
    for (const t of v.transactions) {
      expect(Number.isInteger(t.amount) && t.amount > 0).toBe(true);
      if (t.projectId) expect(ids.has(t.projectId)).toBe(true);
    }
  });
});
