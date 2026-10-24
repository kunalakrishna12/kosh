import { describe, expect, it } from 'vitest';
import { budgetStatus, suggestBudgets } from './budgets';
import { isBackup, newVaultKey, seal, sealBytes, unsealBytes, WrongPasswordError } from './crypto';
import { amountInWords, formatNumber, invoiceState, paymentEntries, totals } from './invoices';
import { taxSummary } from './reports';
import { emptyCompany, emptyVault, type Invoice, type Transaction } from './types';

const inv = (patch: Partial<Invoice> = {}): Invoice => ({
  id: 'i1',
  number: 'INV-0001',
  clientName: 'Acme',
  clientAddress: '',
  clientTaxId: '',
  clientEmail: '',
  placeOfSupply: 'Telangana',
  issueDate: '2026-10-01',
  dueDate: '2026-10-16',
  items: [
    { id: 'a', description: 'Design', code: '998391', qty: 2, rate: 50_000_00, taxRate: 18 },
    { id: 'b', description: 'Hosting', code: '998315', qty: 1, rate: 10_000_00, taxRate: 12 },
  ],
  notes: '',
  status: 'sent',
  createdAt: 0,
  updatedAt: 0,
  ...patch,
});

describe('invoice totals', () => {
  it('splits into CGST + SGST within the same state', () => {
    const t = totals(inv(), { state: 'Telangana' });
    expect(t.subtotal).toBe(1_10_000_00);
    expect(t.tax).toBe(18_000_00 + 1_200_00);
    expect(t.split).toBe(true);
    expect(t.cgst + t.sgst).toBe(t.tax);
    expect(t.igst).toBe(0);
    expect(t.total).toBe(1_29_200_00);
  });

  it('charges IGST across states', () => {
    const t = totals(inv({ placeOfSupply: 'Karnataka' }), { state: 'telangana ' });
    expect(t.split).toBe(false);
    expect(t.igst).toBe(t.tax);
  });

  it('records one income entry per GST rate so the tax summary matches', () => {
    let n = 0;
    const entries = paymentEntries(inv(), { state: 'Telangana' }, '2026-10-20', () => `t${++n}`);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.invoiceId === 'i1' && e.kind === 'income' && e.book === 'company')).toBe(true);
    const v = { ...emptyVault(), transactions: entries };
    expect(taxSummary(v, '2026-10-01', '2026-10-31').collected).toBe(19_200_00);
  });

  it('knows overdue from due', () => {
    expect(invoiceState(inv(), '2026-10-10')).toBe('due');
    expect(invoiceState(inv(), '2026-10-17')).toBe('overdue');
    expect(invoiceState(inv({ status: 'paid' }), '2026-12-01')).toBe('paid');
  });

  it('numbers invoices from the prefix and counter', () => {
    expect(formatNumber({ ...emptyCompany(), invoicePrefix: 'LS/26-27/', nextInvoiceNumber: 7 })).toBe('LS/26-27/0007');
  });
});

describe('amount in words', () => {
  it('uses lakh and crore for rupees', () => {
    expect(amountInWords(1_18_000_00, 'INR')).toBe('Rupees One Lakh Eighteen Thousand Only');
    expect(amountInWords(2_05_00_450_50, 'INR')).toBe('Rupees Two Crore Five Lakh Four Hundred Fifty and Fifty Paise Only');
  });
  it('uses millions elsewhere', () => {
    expect(amountInWords(1_250_000_00, 'USD')).toBe('Dollars One Million Two Hundred Fifty Thousand Only');
  });
});

describe('budgets', () => {
  const tx = (category: string, amount: number, date: string): Transaction => ({ id: `${category}${date}`, book: 'personal', kind: 'expense', amount, category, date, note: '', createdAt: 0 });

  it('tracks spend, projects month end and flags pace', () => {
    const v = {
      ...emptyVault(),
      budgets: [{ id: 'b', book: 'personal' as const, category: 'Dining', amount: 10_000, createdAt: 0 }],
      transactions: [tx('Dining', 3_000, '2026-10-02'), tx('Dining', 2_000, '2026-10-09')],
    };
    const [s] = budgetStatus(v, '2026-10', '2026-10-10');
    expect(s.spent).toBe(5_000);
    expect(s.used).toBe(0.5);
    expect(s.projected).toBe(15_500);
    expect(s.state).toBe('pace');
  });

  it('suggests budgets from the last three months', () => {
    const v = { ...emptyVault(), transactions: [tx('Dining', 9_000_00, '2026-07-10'), tx('Dining', 10_000_00, '2026-08-10'), tx('Dining', 11_000_00, '2026-09-10')] };
    expect(suggestBudgets(v, 'personal', '2026-10-15')).toEqual([{ category: 'Dining', amount: 10_000_00 }]);
  });
});

describe('document encryption', () => {
  it('round-trips bytes and binds them to their id', async () => {
    const vk = await newVaultKey('pw', 1_000);
    const bytes = new TextEncoder().encode('passport scan').buffer;
    const sealed = await sealBytes(vk.key, 'doc-1', bytes);
    expect(new TextDecoder().decode(await unsealBytes(vk.key, 'doc-1', sealed))).toBe('passport scan');
    await expect(unsealBytes(vk.key, 'doc-2', sealed)).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('recognises v2 backups', async () => {
    const vault = await seal(await newVaultKey('pw', 100_000), {});
    expect(isBackup({ format: 'kosh-backup', v: 2, vault, docs: {} })).toBe(true);
    expect(isBackup(vault)).toBe(false);
  });
});

describe('monthly budget', () => {
  const tx = (amount: number, date: string, category = 'Dining'): Transaction => ({ id: `${category}${date}${amount}`, book: 'personal', kind: 'expense', amount, category, date, note: '', createdAt: 0 });

  it('counts bills still due when working out what is safe to spend', async () => {
    const { overallStatus } = await import('./budgets');
    const v = {
      ...emptyVault(),
      settings: { ...emptyVault().settings, monthlyBudget: { personal: 40_000_00, company: 0 } },
      transactions: [tx(10_000_00, '2026-10-03'), tx(5_000_00, '2026-10-08', 'Shopping')],
      bills: [{ id: 'rent', book: 'personal' as const, name: 'Rent', vendor: '', kind: 'rent' as const, amount: 12_000_00, variable: false, frequency: 'monthly' as const, nextDue: '2026-10-25', category: 'Rent', autopay: false, active: true, notes: '', createdAt: 0 }],
    };
    const o = overallStatus(v, 'personal', '2026-10', '2026-10-11');
    expect(o.spent).toBe(15_000_00);
    expect(o.committed).toBe(12_000_00);
    expect(o.safeToSpend).toBe(13_000_00);
    expect(o.daysLeft).toBe(21);
    expect(o.perDayLeft).toBe(61_900); // ₹13,000 / 21 days, rounded to whole rupees
    // No history yet: assume the pace so far continues (₹15,000 over 11 days → ₹27,273 more), never less than bills due.
    expect(o.projected).toBe(42_273_00);
  });

  it('projects from what usually happens in the rest of the month', async () => {
    const { usualRestOfMonth } = await import('./budgets');
    const v = { ...emptyVault(), transactions: ['07', '08', '09'].flatMap((m) => [tx(30_000_00, `2026-${m}-02`, 'Rent'), tx(3_000_00, `2026-${m}-20`)]) };
    // Rent lands on the 2nd, so by the 10th only the late-month spending is still to come.
    expect(usualRestOfMonth(v, 'personal', '2026-10', 10)).toBe(3_000_00);
  });

  it('shows what an expense does to its budgets before it is saved', async () => {
    const { entryImpact } = await import('./budgets');
    const v = {
      ...emptyVault(),
      settings: { ...emptyVault().settings, monthlyBudget: { personal: 20_000_00, company: 0 } },
      budgets: [{ id: 'd', book: 'personal' as const, category: 'Dining', amount: 5_000_00, createdAt: 0 }],
      transactions: [tx(4_000_00, '2026-10-03')],
    };
    expect(entryImpact(v, { book: 'personal', category: 'Dining', amount: 1_500_00, date: '2026-10-10' })).toEqual({
      category: { name: 'Dining', spent: 5_500_00, limit: 5_000_00 },
      overall: { spent: 5_500_00, limit: 20_000_00 },
    });
    // Editing the existing ₹4,000 entry to ₹4,500 must not count it twice.
    const prev = v.transactions[0];
    expect(entryImpact(v, { book: 'personal', category: 'Dining', amount: 4_500_00, date: '2026-10-03' }, prev).category?.spent).toBe(4_500_00);
  });
});
