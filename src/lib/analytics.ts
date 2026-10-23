import { billSummary, priceChange } from './bills';
import { budgetStatus } from './budgets';
import { invoiceState, totals } from './invoices';
import { addDays, lastMonths, monthKey, today } from './dates';
import type { Book, Project, Transfer, TxKind, VaultData } from './types';
import { TO_COMPANY } from './types';

/*
 * The money model, in one place.
 *
 * Profit & loss (what you earned and spent):
 *   - personal income  = personal income entries + salary and dividends drawn from the company
 *   - company expense  = company expense entries + salary paid to you
 *   Capital, loans, repayments and reimbursements move cash but are not income or expense.
 *
 * Cash (what is in each pocket right now):
 *   - personal = opening + personal income − personal expense − company bills you paid personally
 *                − money you put in the company + money the company paid you
 *   - company  = opening + company income − company expense paid by the company
 *                + money you put in − money it paid you
 *
 * Owed to you = loans + company bills you paid personally − repayments − reimbursements
 */

export interface Flow {
  income: number;
  expense: number;
}

const inRange = (date: string, from?: string, to?: string) => (!from || date >= from) && (!to || date <= to);

/** Transfers expressed as P&L lines, so charts and totals stay consistent with the model above. */
function transferFlows(t: Transfer): { book: Book; kind: TxKind; category: string }[] {
  if (t.reason === 'salary')
    return [
      { book: 'personal', kind: 'income', category: 'Salary' },
      { book: 'company', kind: 'expense', category: 'Founder salary' },
    ];
  if (t.reason === 'dividend') return [{ book: 'personal', kind: 'income', category: 'Dividend' }];
  return [];
}

export interface Line {
  book: Book;
  kind: TxKind;
  amount: number;
  category: string;
  date: string;
  projectId?: string;
}

/** Every P&L line in the vault: transactions plus the transfers that count as income or expense. */
export function plLines(data: VaultData): Line[] {
  // Balance corrections move cash but are neither earned nor spent.
  const lines: Line[] = data.transactions.filter((t) => !t.adjustment).map((t) => ({
    book: t.book,
    kind: t.kind,
    amount: t.amount,
    category: t.category,
    date: t.date,
    projectId: t.projectId,
  }));
  for (const tr of data.transfers) {
    for (const f of transferFlows(tr)) lines.push({ ...f, amount: tr.amount, date: tr.date });
  }
  return lines;
}

export function flow(data: VaultData, book: Book | 'all', from?: string, to?: string): Flow {
  const out = { income: 0, expense: 0 };
  for (const l of plLines(data)) {
    if ((book === 'all' || l.book === book) && inRange(l.date, from, to)) out[l.kind] += l.amount;
  }
  // When looking at both books together, salary is a transfer between your own pockets.
  if (book === 'all') {
    for (const t of data.transfers) {
      if (t.reason === 'salary' && inRange(t.date, from, to)) {
        out.income -= t.amount;
        out.expense -= t.amount;
      }
    }
  }
  return out;
}

export interface Balances {
  personal: number;
  company: number;
  owedToYou: number;
  capital: number;
  drawnThisYear: number;
}

export function balances(data: VaultData, asOf = today()): Balances {
  // Each book starts with its own opening balance plus the opening balance of each of its accounts.
  const accountOpening = (book: Book) => data.accounts.filter((a) => a.book === book).reduce((s, a) => s + a.opening, 0);
  const b: Balances = {
    personal: data.settings.openingBalance.personal + accountOpening('personal'),
    company: data.settings.openingBalance.company + accountOpening('company'),
    owedToYou: 0,
    capital: 0,
    drawnThisYear: 0,
  };
  const year = asOf.slice(0, 4);
  for (const t of data.transactions) {
    if (t.date > asOf) continue;
    const sign = t.kind === 'income' ? 1 : -1;
    if (t.book === 'company' && t.kind === 'expense' && t.paidPersonally) {
      b.personal -= t.amount;
      b.owedToYou += t.amount;
    } else {
      b[t.book] += sign * t.amount;
    }
  }
  for (const t of data.transfers) {
    if (t.date > asOf) continue;
    const toCompany = TO_COMPANY.includes(t.reason);
    b.personal += toCompany ? -t.amount : t.amount;
    b.company += toCompany ? t.amount : -t.amount;
    if (t.reason === 'capital') b.capital += t.amount;
    if (t.reason === 'loan') b.owedToYou += t.amount;
    if (t.reason === 'repayment' || t.reason === 'reimbursement') b.owedToYou -= t.amount;
    if ((t.reason === 'salary' || t.reason === 'dividend') && t.date.startsWith(year)) b.drawnThisYear += t.amount;
  }
  return b;
}

export interface MonthPoint {
  key: string;
  personal: Flow;
  company: Flow;
}

export function monthly(data: VaultData, months = 12, end = today()): MonthPoint[] {
  const keys = lastMonths(months, end);
  const idx = new Map(keys.map((k, i) => [k, i]));
  const points: MonthPoint[] = keys.map((key) => ({ key, personal: { income: 0, expense: 0 }, company: { income: 0, expense: 0 } }));
  for (const l of plLines(data)) {
    const i = idx.get(monthKey(l.date));
    if (i !== undefined && l.date <= end) points[i][l.book][l.kind] += l.amount;
  }
  return points;
}

export interface Slice {
  category: string;
  amount: number;
  share: number;
}

export function byCategory(data: VaultData, book: Book, kind: TxKind, from?: string, to?: string): Slice[] {
  const sums = new Map<string, number>();
  for (const l of plLines(data)) {
    if (l.book === book && l.kind === kind && inRange(l.date, from, to)) sums.set(l.category, (sums.get(l.category) ?? 0) + l.amount);
  }
  const total = [...sums.values()].reduce((a, b) => a + b, 0);
  return [...sums.entries()]
    .map(([category, amount]) => ({ category, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** Average monthly company burn over the last three full months, and how long the cash lasts. */
export function runway(data: VaultData, end = today()): { burn: number; months: number | null } {
  const pts = monthly(data, 4, end).slice(0, 3);
  const net = pts.reduce((s, p) => s + p.company.expense - p.company.income, 0) / 3;
  const cash = balances(data, end).company;
  if (net <= 0) return { burn: Math.round(net), months: null };
  return { burn: Math.round(net), months: Math.max(0, cash / net) };
}

/** Share of personal income kept over the last `months` full months. */
export function savingsRate(data: VaultData, months = 3, end = today()): number | null {
  const pts = monthly(data, months + 1, end).slice(0, months);
  const income = pts.reduce((s, p) => s + p.personal.income, 0);
  const expense = pts.reduce((s, p) => s + p.personal.expense, 0);
  return income > 0 ? (income - expense) / income : null;
}

export interface ProjectStats {
  received: number;
  spent: number;
  profit: number;
  margin: number | null;
  /** Spent as a share of the delivery budget. */
  burn: number | null;
  /** Received as a share of the contract value. */
  collected: number | null;
  outstanding: number;
  lastActivity: string | null;
}

export function projectStats(data: VaultData, p: Project): ProjectStats {
  let received = 0;
  let spent = 0;
  let lastActivity: string | null = null;
  for (const t of data.transactions) {
    if (t.projectId !== p.id) continue;
    if (t.kind === 'income') received += t.amount;
    else spent += t.amount;
    if (!lastActivity || t.date > lastActivity) lastActivity = t.date;
  }
  const profit = received - spent;
  return {
    received,
    spent,
    profit,
    margin: received > 0 ? profit / received : null,
    burn: p.budget > 0 ? spent / p.budget : null,
    collected: p.contract > 0 ? received / p.contract : null,
    outstanding: Math.max(0, p.contract - received),
    lastActivity,
  };
}

export interface Insight {
  tone: 'good' | 'warn' | 'info';
  title: string;
  detail: string;
}

/**
 * Plain-language observations. Windows are rolling (last 30 days vs the 90 before),
 * so a half-finished month never looks like a sudden drop.
 */
export function insights(data: VaultData, fmt: (minor: number) => string, end = today()): Insight[] {
  const out: Insight[] = [];
  const recentFrom = addDays(end, -29);
  const priorFrom = addDays(end, -119);
  const priorTo = addDays(end, -30);
  const names: Record<Book, string> = { personal: 'Personal', company: data.settings.companyName || 'Company' };

  for (const book of ['company', 'personal'] as Book[]) {
    const recent = byCategory(data, book, 'expense', recentFrom, end);
    const prior = new Map(byCategory(data, book, 'expense', priorFrom, priorTo).map((s) => [s.category, s.amount / 3]));
    const totalRecent = recent.reduce((s, x) => s + x.amount, 0);
    const spikes = recent
      .map((s) => ({ ...s, before: prior.get(s.category) ?? 0 }))
      .filter((s) => s.before > 0 && s.amount > s.before * 1.25 && s.amount - s.before > totalRecent * 0.04)
      .sort((a, b) => b.amount - b.before - (a.amount - a.before));
    for (const s of spikes.slice(0, 2)) {
      out.push({
        tone: 'warn',
        title: `${names[book]} · ${s.category} up ${Math.round((s.amount / s.before - 1) * 100)}%`,
        detail: `${fmt(s.amount)} in the last 30 days against a usual ${fmt(Math.round(s.before))} a month.`,
      });
    }
    const drops = recent.length
      ? [...prior.entries()]
          .map(([category, before]) => ({ category, before, now: recent.find((r) => r.category === category)?.amount ?? 0 }))
          .filter((d) => d.before > totalRecent * 0.05 && d.now > 0 && d.now < d.before * 0.7)
          .sort((a, b) => b.before - b.now - (a.before - a.now))
      : [];
    if (drops[0]) {
      const d = drops[0];
      out.push({
        tone: 'good',
        title: `${names[book]} · ${d.category} down ${Math.round((1 - d.now / d.before) * 100)}%`,
        detail: `${fmt(d.now)} in the last 30 days, down from about ${fmt(Math.round(d.before))} a month.`,
      });
    }
  }

  const rw = runway(data, end);
  if (rw.months === null && data.transactions.some((t) => t.book === 'company')) {
    out.push({ tone: 'good', title: 'Company is cash-flow positive', detail: `Earning ${fmt(-rw.burn)} more than it spends, on average over three months.` });
  } else if (rw.months !== null && rw.months < 6) {
    out.push({
      tone: 'warn',
      title: `About ${rw.months.toFixed(1)} months of runway`,
      detail: `The company burns ${fmt(rw.burn)} a month. Collect outstanding invoices or trim fixed costs.`,
    });
  }

  for (const p of data.projects) {
    if (p.status === 'done') continue;
    const s = projectStats(data, p);
    if (s.burn !== null && s.burn > 1) {
      out.push({ tone: 'warn', title: `${p.name} is over budget`, detail: `Spent ${fmt(s.spent)} of a ${fmt(p.budget)} budget (${Math.round(s.burn * 100)}%).` });
    } else if (s.burn !== null && s.burn > 0.85) {
      out.push({ tone: 'info', title: `${p.name} has used ${Math.round(s.burn * 100)}% of budget`, detail: `${fmt(p.budget - s.spent)} left to deliver it.` });
    }
    if (s.outstanding > 0 && s.collected !== null && s.collected < 0.5 && s.burn !== null && s.burn > 0.5) {
      out.push({ tone: 'info', title: `${p.client || p.name}: ${fmt(s.outstanding)} still to collect`, detail: `More than half the budget is spent but under half the contract is paid.` });
    }
  }

  const bills = billSummary(data, end);
  if (bills.overdue.length) {
    out.unshift({
      tone: 'warn',
      title: `${bills.overdue.length} bill${bills.overdue.length > 1 ? 's' : ''} overdue`,
      detail: `${bills.overdue.map((x) => x.name).slice(0, 3).join(', ')}: ${fmt(bills.overdue.reduce((s, x) => s + x.amount, 0))} in total.`,
    });
  }
  if (bills.soon.length) {
    out.push({
      tone: 'info',
      title: `${fmt(bills.soon.reduce((s, x) => s + x.amount, 0))} in bills due this week`,
      detail: bills.soon.map((x) => x.name).slice(0, 4).join(', ') + (bills.soon.length > 4 ? '…' : '.'),
    });
  }
  for (const bill of data.bills) {
    const change = bill.active && bill.variable ? priceChange(data, bill.id) : null;
    if (change !== null && change >= 0.2) {
      out.push({ tone: 'warn', title: `${bill.name} bill up ${Math.round(change * 100)}%`, detail: `Last payment was ${fmt(bill.amount)}. Check usage, or set a spending limit with ${bill.vendor || 'the provider'}.` });
    }
  }

  const overdueInv = data.invoices.filter((i) => invoiceState(i, end) === 'overdue');
  if (overdueInv.length) {
    const sum = overdueInv.reduce((s, i) => s + totals(i, data.settings.company).total, 0);
    out.unshift({
      tone: 'warn',
      title: `${fmt(sum)} in overdue invoices`,
      detail: `${overdueInv.map((i) => i.clientName || i.number).slice(0, 3).join(', ')}. Send a reminder from Invoices.`,
    });
  }

  for (const s of budgetStatus(data, end.slice(0, 7), end)) {
    const name = `${s.budget.book === 'company' ? names.company : 'Personal'} · ${s.budget.category}`;
    if (s.state === 'over') out.push({ tone: 'warn', title: `${name} is over budget`, detail: `${fmt(s.spent)} spent of ${fmt(s.budget.amount)} this month.` });
    else if (s.state === 'pace') out.push({ tone: 'warn', title: `${name} is on pace to go over`, detail: `Heading for ${fmt(s.projected)} against a ${fmt(s.budget.amount)} budget. About ${fmt(s.perDayLeft)} a day is left.` });
  }

  const soon = addDays(end, 30);
  const expiring = data.docs.filter((d) => d.expiresOn && d.expiresOn <= soon).sort((a, b) => (a.expiresOn! < b.expiresOn! ? -1 : 1));
  if (expiring.length) {
    out.push({
      tone: 'warn',
      title: `${expiring.length} document${expiring.length > 1 ? 's' : ''} expiring within 30 days`,
      detail: expiring.map((d) => d.name.replace(/\.[a-z0-9]+$/i, '')).slice(0, 3).join(', ') + '.',
    });
  }

  for (const sip of data.sips.filter((s) => s.active && s.nextDue <= addDays(end, 3)).slice(0, 3)) {
    out.push({
      tone: sip.nextDue < end ? 'warn' : 'info',
      title: `SIP ${sip.nextDue < end ? 'pending' : 'due'}: ${sip.name} · ${fmt(sip.amount)}`,
      detail: sip.autopay ? 'Auto-debit is on. Mark it done once it leaves your bank.' : 'Pay it in your app, then mark it done in Accounts.',
    });
  }

  const b = balances(data, end);
  if (b.owedToYou > 0) {
    out.push({ tone: 'info', title: `${names.company} owes you ${fmt(b.owedToYou)}`, detail: 'Loans and company bills you paid personally, not yet paid back.' });
  }

  const sr = savingsRate(data, 3, end);
  if (sr !== null) {
    out.push(
      sr >= 0.2
        ? { tone: 'good', title: `You kept ${Math.round(sr * 100)}% of what you earned`, detail: 'Personal savings rate over the last three months.' }
        : { tone: 'warn', title: `Savings rate is ${Math.round(sr * 100)}%`, detail: 'Over the last three months. Twenty percent or more is a healthy target.' },
    );
  }
  return out;
}

export function sortByDateDesc<T extends { date: string; createdAt: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

export interface AccountBalances {
  byAccount: Map<string, number>;
  /** Cash in each book that isn't recorded against any account. */
  unassigned: Record<Book, number>;
}

/**
 * Balance of every account: its opening balance, plus entries and transfers that name it,
 * plus moves between accounts. Whatever a book holds beyond its accounts is "unassigned".
 */
export function accountBalances(data: VaultData, asOf = today()): AccountBalances {
  const byAccount = new Map(data.accounts.map((a) => [a.id, a.opening]));
  const add = (id: string | undefined, v: number) => {
    if (id && byAccount.has(id)) byAccount.set(id, byAccount.get(id)! + v);
  };
  for (const t of data.transactions) if (t.date <= asOf) add(t.accountId, t.kind === 'income' ? t.amount : -t.amount);
  for (const t of data.transfers) {
    if (t.date > asOf) continue;
    add(t.fromAccountId, -t.amount);
    add(t.toAccountId, t.amount);
  }
  for (const m of data.moves) {
    if (m.date > asOf) continue;
    add(m.from, -m.amount);
    add(m.to, m.amount);
  }
  const b = balances(data, asOf);
  const unassigned = { personal: b.personal, company: b.company };
  for (const a of data.accounts) unassigned[a.book] -= byAccount.get(a.id)!;
  return { byAccount, unassigned };
}
