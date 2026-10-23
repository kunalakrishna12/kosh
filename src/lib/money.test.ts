import { describe, expect, it } from 'vitest';
import { toBalance, toMinor } from './money';

describe('amounts and balances', () => {
  it('amounts must be positive', () => {
    expect(toMinor('1,250.50')).toBe(125_050);
    expect(toMinor('0')).toBeNull();
    expect(toMinor('-5')).toBeNull();
  });

  it('balances accept zero, negatives and blanks', () => {
    expect(toBalance('0')).toBe(0);
    expect(toBalance('0.00')).toBe(0);
    expect(toBalance('')).toBe(0);
    expect(toBalance('-0')).toBe(0);
    expect(toBalance('25,000')).toBe(2_500_000);
    expect(toBalance('-4,500.5')).toBe(-450_050);
    expect(toBalance('abc')).toBeNull();
    expect(toBalance('1.234')).toBeNull();
  });
});
