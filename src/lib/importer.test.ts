import { describe, expect, it } from 'vitest';
import { buildRows, categorise, detectDateFormat, detectMapping, matchBill, merchantKey, parseAmount, parseCsv, parseDateWith } from './importer';
import { emptyVault, type Bill } from './types';

const HDFC = `HDFC BANK Ltd. Statement of account
Account No : 50200071234567

Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/10/26,"UPI-SWIGGY-SWIGGY8@ICICI",0001,01/10/26,486.00,,1000.00
02/10/26,"POS AMAZON WEB SERVICES",0002,02/10/26,"31,240.55",,900.00
03/10/26,"NEFT CR-KITE LOGISTICS",0003,03/10/26,,"2,59,600.00",3000.00
,,,,,,
,Opening balance,,,,,`;

describe('CSV parsing', () => {
  it('handles quotes, embedded commas and escaped quotes', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\n1,2,3')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });

  it('detects semicolons and tabs', () => {
    expect(parseCsv('a;b;c\n1;2;3')[1]).toEqual(['1', '2', '3']);
    expect(parseCsv('a\tb\n1\t2')[1]).toEqual(['1', '2']);
  });
});

describe('column detection', () => {
  it('skips the preamble and finds debit/credit columns', () => {
    const m = detectMapping(parseCsv(HDFC))!;
    expect(m.headerRow).toBe(2);
    expect(m.date).toBe(0);
    expect(m.description).toBe(1);
    expect(m.debit).toBe(4);
    expect(m.credit).toBe(5);
    expect(m.dateFormat).toBe('dmy');
  });

  it('finds a single signed amount column', () => {
    const m = detectMapping(parseCsv('Transaction Date,Description,Amount\n2026-10-01,Coffee,-4.50'))!;
    expect(m.amount).toBe(2);
    expect(m.dateFormat).toBe('ymd');
  });
});

describe('dates and amounts', () => {
  it('parses common bank date styles', () => {
    expect(parseDateWith('05/10/26', 'dmy')).toBe('2026-10-05');
    expect(parseDateWith('10/05/2026', 'mdy')).toBe('2026-10-05');
    expect(parseDateWith('2026-10-05', 'dmy')).toBe('2026-10-05');
    expect(parseDateWith('05-Oct-2026', 'dmy')).toBe('2026-10-05');
    expect(parseDateWith('5 Oct 26', 'dmy')).toBe('2026-10-05');
    expect(parseDateWith('31/02/26', 'dmy')).toBeNull();
  });

  it('prefers month-first only when day-first cannot work', () => {
    expect(detectDateFormat(['01/02/26', '03/04/26'])).toBe('dmy');
    expect(detectDateFormat(['12/25/26', '01/02/26'])).toBe('mdy');
  });

  it('reads Indian grouping, brackets, signs and Dr/Cr', () => {
    expect(parseAmount('2,59,600.00')).toBe(25_960_000);
    expect(parseAmount('(500.00)')).toBe(-50_000);
    expect(parseAmount('-12.5')).toBe(-1_250);
    expect(parseAmount('1,000 Dr')).toBe(-100_000);
    expect(parseAmount('₹ 2,000')).toBe(200_000);
    expect(parseAmount('')).toBeNull();
  });
});

describe('categorising', () => {
  it('extracts a merchant from noisy narrations', () => {
    expect(merchantKey('UPI/412345678/SWIGGY LTD/swiggy@axis/Payment')).toBe('swiggy');
    expect(merchantKey('POS 4591XXXX AMAZON WEB SERVICES')).toBe('amazon web');
  });

  it('uses your rules first, then history, then the built-in list', () => {
    const rules = [{ id: 'r', book: 'personal' as const, match: 'swiggy', category: 'Team lunches', createdAt: 0 }];
    expect(categorise('UPI-SWIGGY', 'expense', 'personal', rules, new Map()).category).toBe('Team lunches');
    expect(categorise('UPI-SWIGGY', 'expense', 'personal', [], new Map([['personal:expense:swiggy', 'Food']])).category).toBe('Food');
    expect(categorise('UPI-SWIGGY', 'expense', 'personal', [], new Map())).toEqual({ category: 'Dining', source: 'builtin' });
    expect(categorise('POS AMAZON WEB SERVICES', 'expense', 'company', [], new Map()).category).toBe('Cloud');
  });
});

describe('building rows', () => {
  it('turns a statement into entries and flags duplicates', () => {
    const rows = parseCsv(HDFC);
    const m = detectMapping(rows)!;
    const v = { ...emptyVault(), transactions: [{ id: 'x', book: 'company' as const, kind: 'expense' as const, amount: 48_600, category: 'Travel', date: '2026-10-01', note: 'Swiggy', createdAt: 0 }] };
    const out = buildRows(rows, m, 'company', v);
    expect(out.rows).toHaveLength(3);
    expect(out.skipped).toBe(1);
    expect(out.rows[0]).toMatchObject({ date: '2026-10-01', kind: 'expense', amount: 48_600, duplicate: true, include: false });
    expect(out.rows[1]).toMatchObject({ kind: 'expense', amount: 3_124_055, category: 'Cloud', include: true });
    expect(out.rows[2]).toMatchObject({ kind: 'income', amount: 25_960_000, category: 'Client payment' });
  });

  it('matches bill payments by vendor, amount and date', () => {
    const bill: Bill = { id: 'b', book: 'company', name: 'AWS', vendor: 'Amazon Web Services', kind: 'cloud', amount: 3_000_000, variable: true, frequency: 'monthly', nextDue: '2026-10-03', category: 'Cloud', autopay: true, active: true, notes: '', createdAt: 0 };
    expect(matchBill([bill], 'company', 'POS AMAZON WEB SERVICES', 3_124_055, '2026-10-02')?.id).toBe('b');
    expect(matchBill([bill], 'company', 'POS AMAZON WEB SERVICES', 3_124_055, '2026-11-20')).toBeUndefined();
    expect(matchBill([bill], 'personal', 'POS AMAZON WEB SERVICES', 3_124_055, '2026-10-02')).toBeUndefined();
  });
});

describe('invoice matching', () => {
  it('links a credit that quotes an open invoice number', async () => {
    const { demoVault } = await import('./demo');
    const { matchInvoice } = await import('./importer');
    const v = demoVault();
    const open = v.invoices.find((i) => i.status === 'sent')!;
    expect(matchInvoice(v, `NEFT CR-CLIENT-INV ${open.number}`, 1)?.id).toBe(open.id);
    expect(matchInvoice(v, 'NEFT CR-SOMEONE ELSE', 1)).toBeUndefined();
  });
});
