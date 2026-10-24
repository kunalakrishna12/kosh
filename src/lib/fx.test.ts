import { describe, expect, it } from 'vitest';
import { priceChange } from './bills';
import { foreignFmt, fxToBase, impliedRate, lastKnownRate } from './fx';
import { emptyVault, type Transaction } from './types';

describe('foreign currency', () => {
  it('converts a $20 subscription with the card fee', () => {
    // $20 × ₹84.12 × 1.0413 = ₹1,751.88 (1,751.883)
    expect(fxToBase({ amount: 20_00, rate: 84.12, markup: 4.13 })).toBe(1_751_88);
    expect(fxToBase({ amount: 20_00, rate: 84.12, markup: 0 })).toBe(1_682_40);
  });

  it('learns the real rate from what the statement charged', () => {
    const rate = impliedRate(1_759_00, { amount: 20_00, markup: 4.13 });
    expect(rate).toBeCloseTo(84.4617, 3);
    // Next month's estimate then matches the last real charge.
    expect(fxToBase({ amount: 20_00, rate, markup: 4.13 })).toBe(1_759_00);
  });

  it('a weaker rupee is not a price rise', () => {
    const pay = (amount: number, usd: number, date: string): Transaction => ({ id: date, book: 'company', kind: 'expense', amount, category: 'APIs', date, note: '', billId: 'b', fx: { currency: 'USD', amount: usd, rate: 84, markup: 4.13 }, createdAt: 0 });
    expect(priceChange({ ...emptyVault(), transactions: [pay(1_740_00, 20_00, '2026-09-07'), pay(1_790_00, 20_00, '2026-10-07')] }, 'b')).toBe(0);
    expect(priceChange({ ...emptyVault(), transactions: [pay(1_740_00, 20_00, '2026-09-07'), pay(2_610_00, 30_00, '2026-10-07')] }, 'b')).toBe(0.5);
  });

  it('remembers the last rate used and formats foreign amounts', () => {
    const v = { ...emptyVault(), transactions: [{ id: 'x', book: 'personal' as const, kind: 'expense' as const, amount: 1, category: 'x', date: '2026-10-01', note: '', fx: { currency: 'USD', amount: 1, rate: 85.5, markup: 0 }, createdAt: 1 }] };
    expect(lastKnownRate(v, 'USD')).toBe(85.5);
    expect(lastKnownRate(v, 'EUR')).toBeUndefined();
    expect(foreignFmt('USD', 20_00)).toBe('$20.00');
  });
});
