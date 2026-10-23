import { isoDate } from './dates';
import { invoiceState, totals } from './invoices';
import type { Bill, Book, Invoice, Rule, Transaction, TxKind, VaultData } from './types';

/* ───────── CSV ───────── */

/** RFC-4180-ish CSV parser: quotes, escaped quotes, CRLF, and `,` `;` or tab delimiters. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const sample = clean.split(/\r?\n/).slice(0, 20).join('\n');
  const count = (d: string) => sample.split(d).length;
  const delim = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) row.push(cell.trim()), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/* ───────── Column detection ───────── */

export interface Mapping {
  headerRow: number;
  date: number;
  description: number;
  /** Either a single signed amount column… */
  amount: number;
  /** …or separate debit and credit columns. */
  debit: number;
  credit: number;
  /** Optional "Dr/Cr" indicator used with a single amount column. */
  drcr: number;
  dateFormat: DateFormat;
}

const has = (h: string, words: string[]) => words.some((w) => h.includes(w));

/** Finds the header row (banks often put account details above it) and guesses each column. */
export function detectMapping(rows: string[][]): Mapping | null {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const h = rows[r].map((x) => x.toLowerCase());
    const date = h.findIndex((x) => has(x, ['date']) && !has(x, ['value date']));
    const dateAny = date >= 0 ? date : h.findIndex((x) => has(x, ['date']));
    if (dateAny < 0) continue;
    const debit = h.findIndex((x) => has(x, ['debit', 'withdrawal', 'dr amount', 'paid out', 'money out']));
    const credit = h.findIndex((x) => has(x, ['credit', 'deposit', 'cr amount', 'paid in', 'money in']));
    const amount = h.findIndex((x) => has(x, ['amount', 'amt']) && !has(x, ['debit', 'credit', 'withdrawal', 'deposit']));
    if (amount < 0 && (debit < 0 || credit < 0)) continue;
    const description = h.findIndex((x) => has(x, ['narration', 'description', 'particular', 'details', 'remarks', 'transaction', 'payee', 'memo']));
    const drcr = h.findIndex((x) => x === 'dr/cr' || x === 'cr/dr' || x === 'type' || x === 'dr / cr');
    const body = rows.slice(r + 1).map((row) => row[dateAny] ?? '');
    return {
      headerRow: r,
      date: dateAny,
      description: description >= 0 ? description : h.findIndex((_, i) => i !== dateAny && i !== debit && i !== credit && i !== amount),
      amount,
      debit,
      credit,
      drcr,
      dateFormat: detectDateFormat(body),
    };
  }
  return null;
}

/* ───────── Dates ───────── */

export type DateFormat = 'dmy' | 'mdy' | 'ymd';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseDateWith(raw: string, f: DateFormat): string | null {
  // Drop a trailing time ("05/10/26 14:32", "2026-10-05T09:00").
  const s = raw.trim().replace(/[T ]\d{1,2}:\d{2}.*$/, '');
  const named = s.match(/^(\d{1,2})[-/ ]([a-z]{3})[a-z]*[-/ ,]+(\d{2,4})$/i);
  let y: number, m: number, d: number;
  if (named) {
    d = +named[1];
    m = MONTHS.indexOf(named[2].toLowerCase()) + 1;
    y = +named[3];
  } else {
    const p = s.split(/[-/.]/).map(Number);
    if (p.length !== 3 || p.some((x) => !Number.isFinite(x))) return null;
    if (f === 'ymd' || p[0] > 31) [y, m, d] = p;
    else if (f === 'mdy') [m, d, y] = p;
    else [d, m, y] = p;
  }
  if (y < 100) y += 2000;
  const date = new Date(y, m - 1, d);
  if (!m || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return isoDate(date);
}

/** Picks the format that parses every value; prefers day-first (India, UK, EU) when ambiguous. */
export function detectDateFormat(values: string[]): DateFormat {
  const vs = values.filter(Boolean).slice(0, 200);
  for (const f of ['ymd', 'dmy', 'mdy'] as DateFormat[]) {
    if (f === 'ymd' && !vs.every((v) => /^\d{4}/.test(v.trim()))) continue;
    if (vs.every((v) => parseDateWith(v, f))) return f;
  }
  return 'dmy';
}

/* ───────── Amounts ───────── */

/** "1,23,456.78", "(500.00)", "-500", "500 Dr", "₹ 2,000" → minor units with sign. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s || s === '-') return null;
  let neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /\bdr\.?$/i.test(s);
  s = s.replace(/\b(dr|cr)\.?$/i, '').replace(/[^\d.-]/g, '');
  if (s.startsWith('-')) neg = true;
  s = s.replace(/-/g, '');
  if (!s || !/^\d*\.?\d*$/.test(s)) return null;
  const v = Math.round(parseFloat(s) * 100);
  if (!Number.isFinite(v)) return null;
  return neg ? -v : v;
}

/* ───────── Categorising ───────── */

/** Turns "UPI/412345678/SWIGGY LTD/swiggy@axis/Payment" into "swiggy". */
export function merchantKey(description: string): string {
  const words = description
    .toLowerCase()
    .replace(/[a-z0-9._-]+@[a-z]+/g, ' ')
    .replace(/[/|:,]+/g, ' ')
    // Reference numbers and masked cards ("4591XXXX", "****1234").
    .replace(/\S*\d\S*/g, ' ')
    .replace(/\bx{3,}\b/g, ' ')
    .replace(/\b(upi|neft|imps|rtgs|ach|nach|pos|ecom|atm|txn|ref|payment|paid|to|from|by|via|transfer|trf|debit|credit|card|purchase|mb|ib|inb|bil|onl|ltd|limited|pvt|private|india|in|the|and|co|com)\b/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return words.slice(0, 2).join(' ');
}

const BUILT_IN: [RegExp, Record<Book, string>][] = [
  [/swiggy|zomato|restaurant|cafe|starbucks|dominos|pizza|eatsure|blinkit cafe/, { personal: 'Dining', company: 'Travel' }],
  [/bigbasket|blinkit|zepto|dmart|grocer|instamart|ratnadeep|more retail|reliance fresh/, { personal: 'Groceries', company: 'Office' }],
  [/uber|ola|rapido|irctc|indigo|vistara|air india|makemytrip|goibibo|redbus|fuel|petrol|hpcl|bpcl|iocl|fastag/, { personal: 'Travel', company: 'Travel' }],
  [/amazon web services|aws|google cloud|gcp|azure|digitalocean|vercel|netlify|cloudflare|heroku|render|supabase|mongodb/, { personal: 'Subscriptions', company: 'Cloud' }],
  [/openai|anthropic|twilio|sendgrid|stripe fee|razorpay fee|msg91|exotel|mapbox|algolia/, { personal: 'Subscriptions', company: 'APIs' }],
  [/github|figma|notion|slack|zoom|atlassian|jira|linear|google workspace|gsuite|microsoft|adobe|canva|freshworks|zoho/, { personal: 'Subscriptions', company: 'Software' }],
  [/netflix|spotify|prime video|hotstar|youtube premium|apple\.com|icloud|jiocinema|sonyliv/, { personal: 'Subscriptions', company: 'Software' }],
  [/airtel|jio|vodafone|vi |bsnl|act fibernet|broadband|electricity|bescom|tsspdcl|tneb|msedcl|water board|gas|piped/, { personal: 'Utilities', company: 'Utilities' }],
  [/rent|landlord|wework|cowork|91springboard|awfis/, { personal: 'Rent', company: 'Rent' }],
  [/salary|payroll/, { personal: 'Other', company: 'Payroll' }],
  [/gst|tds|income tax|advance tax|mca|roc|chartered accountant/, { personal: 'Other', company: 'Legal & Tax' }],
  [/insurance|lic |hdfc ergo|icici lombard|star health|policybazaar|acko|digit/, { personal: 'Insurance', company: 'Insurance' }],
  [/emi|loan|bajaj finance|home loan|car loan/, { personal: 'Loan EMI', company: 'Other' }],
  [/hospital|pharmacy|apollo|medplus|1mg|practo|pharmeasy|clinic|diagnostic/, { personal: 'Health', company: 'Other' }],
  [/amazon|flipkart|myntra|ajio|nykaa|croma|reliance digital|ikea/, { personal: 'Shopping', company: 'Equipment' }],
  [/zerodha|groww|upstox|mutual fund|sip|kuvera|coin by|nps/, { personal: 'Investments', company: 'Other' }],
  [/google ads|facebook|meta ads|linkedin|instagram ads/, { personal: 'Shopping', company: 'Marketing' }],
  [/interest/, { personal: 'Interest', company: 'Other' }],
];

/**
 * Category for a bank line, in order of confidence:
 * your saved rules → what you filed similar entries under before → built-in merchant list.
 */
export function categorise(description: string, kind: TxKind, book: Book, rules: Rule[], learned: Map<string, string>): { category: string; source: 'rule' | 'history' | 'builtin' | 'none' } {
  const d = description.toLowerCase();
  const rule = rules.find((r) => r.book === book && r.match && d.includes(r.match.toLowerCase()));
  if (rule) return { category: rule.category, source: 'rule' };
  const key = merchantKey(description);
  const prior = key && learned.get(`${book}:${kind}:${key}`);
  if (prior) return { category: prior, source: 'history' };
  if (kind === 'expense') {
    for (const [re, cats] of BUILT_IN) if (re.test(d)) return { category: cats[book], source: 'builtin' };
  } else if (/interest/.test(d)) return { category: book === 'personal' ? 'Interest' : 'Other', source: 'builtin' };
  else if (/refund|reversal|cashback/.test(d)) return { category: book === 'personal' ? 'Refund' : 'Other', source: 'builtin' };
  return { category: book === 'company' && kind === 'income' ? 'Client payment' : 'Other', source: 'none' };
}

/** Merchant → most-used category, learned from the entries you already have. */
export function learnFromHistory(transactions: Transaction[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const t of transactions) {
    const key = merchantKey(t.note);
    if (!key || t.category === 'Other') continue;
    const k = `${t.book}:${t.kind}:${key}`;
    const m = counts.get(k) ?? new Map();
    m.set(t.category, (m.get(t.category) ?? 0) + 1);
    counts.set(k, m);
  }
  const out = new Map<string, string>();
  for (const [k, m] of counts) out.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return out;
}

/* ───────── Building rows ───────── */

export interface ImportRow {
  key: string;
  date: string;
  description: string;
  kind: TxKind;
  amount: number;
  category: string;
  source: 'rule' | 'history' | 'builtin' | 'none';
  duplicate: boolean;
  include: boolean;
  billId?: string;
  /** An unpaid invoice this credit pays. */
  invoiceId?: string;
}

export function buildRows(rows: string[][], m: Mapping, book: Book, data: VaultData): { rows: ImportRow[]; skipped: number } {
  const learned = learnFromHistory(data.transactions);
  const existing = new Set(data.transactions.filter((t) => t.book === book).map((t) => `${t.date}|${t.kind}|${t.amount}`));
  const seen = new Map<string, number>();
  const out: ImportRow[] = [];
  let skipped = 0;
  rows.slice(m.headerRow + 1).forEach((r, i) => {
    const date = parseDateWith(r[m.date] ?? '', m.dateFormat);
    let signed: number | null = null;
    if (m.amount >= 0 && (m.debit < 0 || m.credit < 0)) {
      signed = parseAmount(r[m.amount] ?? '');
      const flag = (r[m.drcr] ?? '').trim().toLowerCase();
      if (signed !== null && m.drcr >= 0 && flag) signed = flag.startsWith('d') ? -Math.abs(signed) : Math.abs(signed);
    } else {
      const dr = parseAmount(r[m.debit] ?? '');
      const cr = parseAmount(r[m.credit] ?? '');
      if (dr) signed = -Math.abs(dr);
      else if (cr) signed = Math.abs(cr);
    }
    if (!date || !signed) return void skipped++;
    const kind: TxKind = signed < 0 ? 'expense' : 'income';
    const amount = Math.abs(signed);
    const description = (r[m.description] ?? '').replace(/\s+/g, ' ').trim();
    const sig = `${date}|${kind}|${amount}`;
    // Two identical lines in the same file are both real; only flag what's already in Kosh.
    const n = (seen.get(sig) ?? 0) + 1;
    seen.set(sig, n);
    const duplicate = n === 1 && existing.has(sig);
    const { category, source } = categorise(description, kind, book, data.rules, learned);
    const bill = kind === 'expense' ? matchBill(data.bills, book, description, amount, date) : undefined;
    const invoice = kind === 'income' && book === 'company' ? matchInvoice(data, description, amount) : undefined;
    out.push({
      key: `${i}`,
      date,
      description,
      kind,
      amount,
      category: bill?.category ?? (invoice ? 'Client payment' : category),
      source: bill || invoice ? 'rule' : source,
      duplicate,
      include: !duplicate,
      billId: bill?.id,
      invoiceId: invoice?.id,
    });
  });
  return { rows: out, skipped };
}

/** A bank line that looks like a payment of an active bill: same vendor, similar amount, near its due date. */
export function matchBill(bills: Bill[], book: Book, description: string, amount: number, date: string): Bill | undefined {
  const d = description.toLowerCase();
  return bills.find((b) => {
    if (!b.active || b.book !== book) return false;
    const names = [b.name, b.vendor].map((x) => x.toLowerCase().split(/\s+/)[0]).filter((x) => x.length > 2);
    if (!names.some((n) => d.includes(n))) return false;
    const close = b.variable ? amount <= b.amount * 2 && amount >= b.amount * 0.4 : Math.abs(amount - b.amount) <= b.amount * 0.05;
    const days = Math.abs((new Date(date).getTime() - new Date(b.nextDue).getTime()) / 86_400_000);
    return close && days <= 12;
  });
}

/** A bank credit that pays an open invoice: it quotes the invoice number, or names the client and matches the total. */
export function matchInvoice(data: VaultData, description: string, amount: number): Invoice | undefined {
  const d = description.toLowerCase().replace(/\s+/g, ' ');
  const open = data.invoices.filter((i) => ['due', 'overdue'].includes(invoiceState(i)));
  return (
    open.find((i) => d.includes(i.number.toLowerCase())) ??
    open.find((i) => {
      const first = i.clientName.toLowerCase().split(/\s+/)[0];
      return first.length > 2 && d.includes(first) && totals(i, data.settings.company).total === amount;
    })
  );
}
