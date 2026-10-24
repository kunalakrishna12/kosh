import { describe, expect, it } from 'vitest';
import { moneyFormat, toBalance, toMinor } from './money';

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

describe('formatting', () => {
  it('shows paise with two digits, whole amounts without, and never -0', () => {
    const f = moneyFormat('INR', 'en-IN');
    expect(f.full(1_12_295_90)).toBe('₹1,12,295.90');
    expect(f.full(4_290_00)).toBe('₹4,290');
    expect(f.full(-258_38)).toBe('-₹258.38');
    expect(f.full(-0)).toBe('₹0');
  });
});
