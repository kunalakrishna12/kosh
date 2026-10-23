import type { Secret } from './types';

const SETS = {
  lower: 'abcdefghijkmnopqrstuvwxyz' + 'l',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ' + 'IO',
  digits: '23456789' + '01',
  symbols: '!@#$%^&*-_=+?~',
};
const AMBIGUOUS = /[lIO01]/g;

export interface GenOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
}

export const DEFAULT_GEN: GenOptions = { length: 20, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: true };

/** Uniform random integer below `max`, by rejection sampling (no modulo bias). */
function randomBelow(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export function generatePassword(o: GenOptions): string {
  const pools = (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter((k) => o[k])
    .map((k) => (o.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]));
  if (!pools.length) return '';
  const length = Math.max(o.length, pools.length);
  const all = pools.join('');
  // One from each chosen set, the rest from all of them, then shuffle.
  const chars = pools.map((p) => p[randomBelow(p.length)]);
  while (chars.length < length) chars.push(all[randomBelow(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const COMMON = new Set(
  (
    'password,123456,12345678,123456789,qwerty,abc123,111111,123123,iloveyou,admin,welcome,letmein,monkey,dragon,' +
    'sunshine,princess,football,baseball,master,shadow,superman,trustno1,passw0rd,password1,qwerty123,1q2w3e4r,' +
    'zaq12wsx,asdfgh,qazwsx,login,starwars,hello,freedom,whatever,india123,000000,654321,7777777,121212,secret,' +
    'changeme,test,test123,root,default,company,welcome1,admin123'
  ).split(','),
);

export interface Strength {
  /** 0 very weak … 4 very strong */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  bits: number;
  hint: string;
}

const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];

/**
 * A deliberately conservative estimate: character-pool entropy, discounted for
 * the patterns attackers try first (common passwords, repeats, sequences, years).
 */
export function strength(pw: string): Strength {
  if (!pw) return { score: 0, label: LABELS[0], bits: 0, hint: 'Empty password.' };
  const lower = pw.toLowerCase();
  if (COMMON.has(lower) || COMMON.has(lower.replace(/[^a-z0-9]/g, ''))) {
    return { score: 0, label: LABELS[0], bits: 0, hint: 'This is one of the most common passwords.' };
  }
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
  let bits = pw.length * Math.log2(Math.max(pool, 2));
  let hint = '';

  const unique = new Set(pw).size;
  if (unique <= pw.length / 3) {
    bits *= 0.5;
    hint = 'Too many repeated characters.';
  }
  if (/(abc|bcd|cde|def|123|234|345|456|567|678|789|890|qwe|wer|asd|zxc)/i.test(pw)) {
    bits -= 12;
    hint ||= 'Avoid keyboard and alphabet sequences.';
  }
  if (/(19|20)\d\d/.test(pw)) {
    bits -= 8;
    hint ||= 'Years are easy to guess.';
  }
  if (/^[A-Z]?[a-z]+[!@#$._-]?\d{1,4}[!@#$]?$/.test(pw)) {
    bits = Math.min(bits, 35);
    hint ||= 'A word followed by numbers is a pattern attackers try early.';
  }
  bits = Math.max(0, Math.round(bits));
  const score = (bits < 28 ? 0 : bits < 45 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4) as Strength['score'];
  if (!hint) hint = score >= 3 ? 'Good.' : pw.length < 12 ? 'Use at least 12 characters.' : 'Mix in more kinds of characters.';
  return { score, label: LABELS[score], bits, hint };
}

export interface VaultHealth {
  /** 0–100 */
  score: number;
  weak: Secret[];
  reused: Secret[][];
  old: Secret[];
  insecure: Secret[];
  total: number;
}

const YEAR_MS = 365 * 86_400_000;

export function vaultHealth(secrets: Secret[], now = Date.now()): VaultHealth {
  const withPw = secrets.filter((s) => s.password);
  const weak = withPw.filter((s) => strength(s.password).score <= 1);
  const groups = new Map<string, Secret[]>();
  for (const s of withPw) groups.set(s.password, [...(groups.get(s.password) ?? []), s]);
  const reused = [...groups.values()].filter((g) => g.length > 1);
  const old = withPw.filter((s) => now - s.passwordChangedAt > YEAR_MS);
  const insecure = secrets.filter((s) => /^http:\/\//i.test(s.url));

  const total = withPw.length;
  if (!total) return { score: 100, weak, reused, old, insecure, total };
  const reusedCount = reused.reduce((n, g) => n + g.length, 0);
  // Weak and reused passwords matter most; age and plain-http links less.
  const penalty = (weak.length * 1 + reusedCount * 0.8 + old.length * 0.35 + insecure.length * 0.2) / total;
  const score = Math.max(0, Math.round(100 * (1 - Math.min(1, penalty))));
  return { score, weak, reused, old, insecure, total };
}

/**
 * Have I Been Pwned "range" lookup. Only the first 5 hex characters of the
 * SHA-1 hash leave the device (k-anonymity); the password itself never does.
 * Returns how many times the password appears in known breaches.
 */
export async function breachCount(password: string): Promise<number> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password)));
  const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const res = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' } });
  if (!res.ok) throw new Error(`Breach check failed (${res.status})`);
  const suffix = hex.slice(5);
  for (const line of (await res.text()).split('\n')) {
    const [s, n] = line.trim().split(':');
    if (s === suffix) return Number(n) || 0;
  }
  return 0;
}

export function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
