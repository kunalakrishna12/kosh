import { describe, expect, it } from 'vitest';
import { accountFromStatement, defaultAccountId, masked } from './accounts';
import { accountBalances, balances, flow } from './analytics';
import { demoVault } from './demo';
import { emptyVault, type Account, type Transaction } from './types';

const acc = (id: string, patch: Partial<Account> = {}): Account => ({
  id,
  book: 'personal',
  name: id,
  kind: 'savings',
  bank: '',
  holder: '',
  number: '',
  ifsc: '',
  branch: '',
  upi: '',
  opening: 0,
  color: '#000',
  archived: false,
  notes: '',
  createdAt: 0,
  ...patch,
});
let n = 0;
const tx = (t: Partial<Transaction>): Transaction => ({ id: `t${++n}`, book: 'personal', kind: 'expense', amount: 100, category: 'Other', date: '2026-01-10', note: '', createdAt: n, ...t });

describe('account balances', () => {
  it('adds openings, entries, moves and transfers per account', () => {
    const v = {
      ...emptyVault(),
      accounts: [acc('bank', { opening: 10_000 }), acc('cash', { kind: 'cash', opening: 500 }), acc('co', { book: 'company', kind: 'current' })],
      transactions: [tx({ accountId: 'bank', amount: 1_000 }), tx({ accountId: 'cash', amount: 300 }), tx({ kind: 'income', accountId: 'bank', amount: 2_000 })],
      moves: [{ id: 'm', from: 'bank', to: 'cash', amount: 1_500, date: '2026-01-05', note: 'ATM', createdAt: 0 }],
      transfers: [{ id: 'x', reason: 'capital' as const, amount: 4_000, date: '2026-01-02', note: '', fromAccountId: 'bank', toAccountId: 'co', createdAt: 0 }],
    };
    const { byAccount, unassigned } = accountBalances(v, '2026-12-31');
    expect(byAccount.get('bank')).toBe(10_000 - 1_000 + 2_000 - 1_500 - 4_000);
    expect(byAccount.get('cash')).toBe(500 - 300 + 1_500);
    expect(byAccount.get('co')).toBe(4_000);
    expect(unassigned).toEqual({ personal: 0, company: 0 });
    // Account totals always agree with each book's cash.
    const b = balances(v, '2026-12-31');
    expect(byAccount.get('bank')! + byAccount.get('cash')!).toBe(b.personal);
  });

  it('puts entries without an account in "unassigned"', () => {
    const v = { ...emptyVault(), accounts: [acc('bank', { opening: 1_000 })], transactions: [tx({ amount: 250 })] };
    expect(accountBalances(v, '2026-12-31').unassigned.personal).toBe(-250);
  });

  it('keeps balance updates out of income and spending', () => {
    const v = { ...emptyVault(), accounts: [acc('cash', { kind: 'cash', opening: 1_000 })], transactions: [tx({ accountId: 'cash', amount: 200, adjustment: true })] };
    expect(accountBalances(v, '2026-12-31').byAccount.get('cash')).toBe(800);
    expect(flow(v, 'personal')).toEqual({ income: 0, expense: 0 });
  });

  it('every demo rupee belongs to an account', () => {
    expect(accountBalances(demoVault()).unassigned).toEqual({ personal: 0, company: 0 });
  });
});

describe('account helpers', () => {
  it('defaults to the account you used last', () => {
    const v = { ...emptyVault(), accounts: [acc('a'), acc('b')], transactions: [tx({ accountId: 'a', createdAt: 1 }), tx({ accountId: 'b', createdAt: 5 })] };
    expect(defaultAccountId(v, 'personal')).toBe('b');
    expect(defaultAccountId(v, 'company')).toBeUndefined();
  });

  it('masks account numbers', () => {
    expect(masked('50200071234567')).toBe('•••• 4567');
  });

  it('recognises an account from a statement header', () => {
    const v = { ...emptyVault(), accounts: [acc('hdfc', { number: '50200071234567' }), acc('icici', { number: '000401234999' })] };
    expect(accountFromStatement(v, [['Account No : 50200071234567']])?.id).toBe('hdfc');
    expect(accountFromStatement(v, [['A/c XXXXXXXX4999']])?.id).toBe('icici');
    expect(accountFromStatement(v, [['Statement of account']])).toBeUndefined();
  });
});
