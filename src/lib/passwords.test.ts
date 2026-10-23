import { describe, expect, it } from 'vitest';
import { generatePassword, strength, vaultHealth } from './passwords';
import type { Secret } from './types';

describe('generatePassword', () => {
  it('honours length and includes every chosen character set', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword({ length: 16, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: true });
      expect(pw).toHaveLength(16);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/\d/);
      expect(pw).toMatch(/[^a-zA-Z0-9]/);
      expect(pw).not.toMatch(/[lIO01]/);
    }
  });

  it('only uses the chosen sets', () => {
    expect(generatePassword({ length: 30, lower: false, upper: false, digits: true, symbols: false, avoidAmbiguous: false })).toMatch(/^\d{30}$/);
  });

  it('returns an empty string when nothing is selected', () => {
    expect(generatePassword({ length: 10, lower: false, upper: false, digits: false, symbols: false, avoidAmbiguous: false })).toBe('');
  });
});

describe('strength', () => {
  it.each([
    ['password', 0],
    ['Password1', 0],
    ['sunshine', 0],
    ['Lumen@2024', 1],
  ])('rates %s as weak', (pw, max) => {
    expect(strength(pw).score).toBeLessThanOrEqual(Math.max(max, 1));
  });

  it('rates long random passwords as very strong', () => {
    expect(strength('q7#Vt9!mZr2@Lp4xWc8$').score).toBe(4);
  });
});

describe('vaultHealth', () => {
  const s = (id: string, password: string, ageDays = 10, url = 'https://x.com'): Secret => ({
    id,
    book: 'personal',
    title: id,
    username: '',
    password,
    url,
    notes: '',
    tags: [],
    favorite: false,
    history: [],
    createdAt: 0,
    updatedAt: 0,
    passwordChangedAt: Date.now() - ageDays * 86_400_000,
  });

  it('is perfect for strong, unique, recent passwords', () => {
    const h = vaultHealth([s('a', 'q7#Vt9!mZr2@Lp4xWc8$'), s('b', 'G3h!pX9v#Qm2Tz7wKe4@')]);
    expect(h.score).toBe(100);
  });

  it('finds weak, reused, old and insecure entries', () => {
    const h = vaultHealth([s('a', 'password'), s('b', 'Same#Pass9word!x'), s('c', 'Same#Pass9word!x'), s('d', 'q7#Vt9!mZr2@Lp4xWc8$', 500, 'http://old.site')]);
    expect(h.weak.map((x) => x.id)).toEqual(['a']);
    expect(h.reused).toHaveLength(1);
    expect(h.reused[0].map((x) => x.id)).toEqual(['b', 'c']);
    expect(h.old.map((x) => x.id)).toEqual(['d']);
    expect(h.insecure.map((x) => x.id)).toEqual(['d']);
    expect(h.score).toBeLessThan(60);
  });
});
