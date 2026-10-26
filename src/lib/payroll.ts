import { isoDate, lastMonths, today } from './dates';
import type { Bill, PayLine, Payslip, SalaryStructure, Staff, Transaction, VaultData } from './types';

/*
 * Indian payroll, kept deliberately simple and explicit:
 *
 *   earnings   = (Basic + HRA + Special + Other) × paid days / days in month, + bonus + reimbursement
 *   PF         = 12% of earned Basic, on at most ₹15,000 (so ₹1,800 max), employer matches it
 *   ESI        = 0.75% employee + 3.25% employer of gross, if monthly gross is ₹21,000 or less
 *   PT         = the state's monthly professional tax
 *   TDS        = the monthly figure for the employee's tax, or a % of a contractor's fee
 *   net pay    = earnings − deductions
 *   cost       = earnings + employer PF + employer ESI
 *
 * Amounts are minor units (paise). Statutory amounts round to whole rupees, as they're filed.
 */

export const PF_RATE = 0.12;
export const PF_WAGE_CEILING = 15_000_00;
export const ESI_EMPLOYEE = 0.0075;
export const ESI_EMPLOYER = 0.0325;
export const ESI_GROSS_LIMIT = 21_000_00;

const rupees = (minor: number) => Math.round(minor / 100) * 100;
const rupeesUp = (minor: number) => Math.ceil(minor / 100) * 100;

export const monthlyGross = (s: SalaryStructure) => s.basic + s.hra + s.special + s.other;

export function emptyStructure(): SalaryStructure {
  return { basic: 0, hra: 0, special: 0, other: 0, pf: true, esi: false, ptMonthly: 200_00, tdsMonthly: 0, tdsPct: 10 };
}

/** A common split of a monthly gross: Basic 50%, HRA half of Basic, the rest Special allowance. */
export function splitGross(gross: number): Pick<SalaryStructure, 'basic' | 'hra' | 'special' | 'other'> {
  const basic = rupees(gross * 0.5);
  const hra = rupees(basic * 0.5);
  return { basic, hra, special: gross - basic - hra, other: 0 };
}

/** Days in a month this person was on the books (joined or left part-way). */
export function daysEmployed(staff: Pick<Staff, 'joinDate' | 'exitDate'>, month: string): number {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const first = `${month}-01`;
  const last = isoDate(new Date(y, m, 0));
  const start = staff.joinDate > first ? staff.joinDate : first;
  const end = staff.exitDate && staff.exitDate < last ? staff.exitDate : last;
  if (start > end) return 0;
  return Math.min(days, Number(end.slice(8)) - Number(start.slice(8)) + 1);
}

export interface PayInputs {
  lopDays: number;
  bonus: number;
  reimbursement: number;
  deduction: number;
  deductionLabel: string;
}

export const noInputs = (): PayInputs => ({ lopDays: 0, bonus: 0, reimbursement: 0, deduction: 0, deductionLabel: 'Advance recovery' });

/** Works out one month's payslip for one person. Nothing is saved. */
export function computePayslip(staff: Staff, month: string, inputs: PayInputs = noInputs(), id: string = crypto.randomUUID()): Payslip {
  const s = staff.structure;
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const employed = daysEmployed(staff, month);
  const paidDays = Math.max(0, employed - Math.max(0, inputs.lopDays));
  const f = paidDays / daysInMonth;
  const part = (v: number) => rupees(v * f);

  const contractor = staff.type === 'contractor';
  const earnings: PayLine[] = contractor
    ? [{ label: 'Professional fee', amount: part(monthlyGross(s)) }]
    : [
        { label: 'Basic', amount: part(s.basic) },
        { label: 'House rent allowance', amount: part(s.hra) },
        { label: 'Special allowance', amount: part(s.special) },
        { label: 'Other allowances', amount: part(s.other) },
      ];
  if (inputs.bonus) earnings.push({ label: 'Bonus / incentive', amount: inputs.bonus });
  const taxable = earnings.reduce((a, e) => a + e.amount, 0);
  if (inputs.reimbursement) earnings.push({ label: 'Reimbursement', amount: inputs.reimbursement });
  const nonZero = (l: PayLine[]) => l.filter((x) => x.amount > 0);

  const deductions: PayLine[] = [];
  const employer: PayLine[] = [];
  if (contractor) {
    if (s.tdsPct > 0) deductions.push({ label: `TDS @ ${s.tdsPct}%`, amount: rupees((taxable * s.tdsPct) / 100) });
  } else {
    if (s.pf) {
      const pf = rupees(Math.min(earnings[0].amount, PF_WAGE_CEILING) * PF_RATE);
      deductions.push({ label: 'Provident fund (12%)', amount: pf });
      employer.push({ label: 'Employer PF (12%)', amount: pf });
    }
    // ESI eligibility is decided on the full monthly gross, not the prorated one.
    if (s.esi && monthlyGross(s) <= ESI_GROSS_LIMIT) {
      deductions.push({ label: 'ESI (0.75%)', amount: rupeesUp(taxable * ESI_EMPLOYEE) });
      employer.push({ label: 'Employer ESI (3.25%)', amount: rupeesUp(taxable * ESI_EMPLOYER) });
    }
    if (s.ptMonthly && paidDays > 0) deductions.push({ label: 'Professional tax', amount: s.ptMonthly });
    if (s.tdsMonthly && paidDays > 0) deductions.push({ label: 'TDS (income tax)', amount: s.tdsMonthly });
  }
  if (inputs.deduction) deductions.push({ label: inputs.deductionLabel || 'Other deduction', amount: inputs.deduction });

  const gross = earnings.reduce((a, e) => a + e.amount, 0);
  const totalDeductions = deductions.reduce((a, d) => a + d.amount, 0);
  return {
    id,
    staffId: staff.id,
    month,
    daysInMonth,
    paidDays,
    lopDays: Math.max(0, employed - paidDays),
    earnings: nonZero(earnings),
    deductions: nonZero(deductions),
    employer: nonZero(employer),
    gross,
    totalDeductions,
    net: gross - totalDeductions,
    status: 'draft',
    snapshot: {
      name: staff.name,
      designation: staff.designation,
      employeeId: staff.employeeId,
      type: staff.type,
      pan: staff.pan,
      uan: staff.uan,
      bankName: staff.bankName,
      accountNumber: staff.accountNumber,
      joinDate: staff.joinDate,
    },
    createdAt: Date.now(),
  };
}

export const employerCost = (p: Payslip) => p.gross + p.employer.reduce((a, e) => a + e.amount, 0);

/** Estimated monthly cost of a person to the company, at full attendance. */
export function staffMonthlyCost(staff: Staff): number {
  return employerCost(computePayslip({ ...staff, joinDate: '1900-01-01', exitDate: undefined }, today().slice(0, 7), noInputs(), 'estimate'));
}

/** People on the books at any point in the month. */
export function staffForMonth(data: VaultData, month: string): Staff[] {
  return data.staff.filter((s) => daysEmployed(s, month) > 0).sort((a, b) => a.name.localeCompare(b.name));
}

const sumLines = (slips: Payslip[], match: RegExp, which: 'deductions' | 'employer') =>
  slips.reduce((a, p) => a + p[which].filter((l) => match.test(l.label)).reduce((x, l) => x + l.amount, 0), 0);

/** Government dues from a month's payslips, with their usual deposit dates. */
export function statutoryDues(slips: Payslip[], month: string) {
  const [y, m] = month.split('-').map(Number);
  const next = (day: number) => isoDate(new Date(y, m, day));
  return [
    { name: 'TDS on salaries', due: next(7), amount: sumLines(slips, /^TDS/, 'deductions') },
    { name: 'PF & ESI contributions', due: next(15), amount: sumLines(slips, /Provident|PF|ESI/, 'deductions') + sumLines(slips, /Provident|PF|ESI/, 'employer') },
    { name: 'Professional tax', due: next(10), amount: sumLines(slips, /^Professional tax/, 'deductions') },
  ].filter((d) => d.amount > 0);
}

/**
 * Marks payslips paid and records what happens to the money:
 *   - each person's net pay as a company Payroll expense from `accountId`
 *   - the government dues (TDS, PF & ESI, PT) as one-time bills, due on their usual dates
 * Together they add up to the full cost: gross pay plus employer contributions.
 */
export function payPayroll(data: VaultData, slipIds: string[], date: string, accountId?: string): VaultData {
  const ids = new Set(slipIds);
  const slips = data.payslips.filter((p) => ids.has(p.id) && p.status === 'draft');
  if (!slips.length) return data;
  const month = slips[0].month;
  const label = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString('en', { month: 'short', year: 'numeric' });
  const now = Date.now();
  const txs: Transaction[] = slips
    .filter((p) => p.net > 0)
    .map((p, i) => ({
      id: crypto.randomUUID(),
      book: 'company',
      kind: 'expense',
      amount: p.net,
      category: p.snapshot.type === 'contractor' ? 'Contractors' : 'Payroll',
      date,
      note: `${p.snapshot.type === 'contractor' ? 'Fee' : 'Salary'} · ${p.snapshot.name} · ${label}`,
      ...(accountId ? { accountId } : {}),
      createdAt: now - i,
    }));
  const bills: Bill[] = statutoryDues(slips, month).map((d) => ({
    id: crypto.randomUUID(),
    book: 'company',
    name: `${d.name} · ${label}`,
    vendor: 'Government',
    kind: 'tax',
    amount: d.amount,
    variable: true,
    frequency: 'monthly',
    nextDue: d.due,
    category: 'Payroll taxes',
    ...(accountId ? { accountId } : {}),
    autopay: false,
    active: true,
    once: true,
    notes: 'Created by payroll. Pay it when you deposit it on the government portal.',
    createdAt: now,
  }));
  return {
    ...data,
    transactions: [...txs, ...data.transactions],
    bills: [...data.bills, ...bills],
    payslips: data.payslips.map((p) => (ids.has(p.id) && p.status === 'draft' ? { ...p, status: 'paid', paidOn: date, ...(accountId ? { accountId } : {}) } : p)),
  };
}

export interface PayrollMonth {
  month: string;
  slips: Payslip[];
  gross: number;
  net: number;
  cost: number;
  status: 'none' | 'draft' | 'partial' | 'paid';
}

export function payrollMonth(data: VaultData, month: string): PayrollMonth {
  const slips = data.payslips.filter((p) => p.month === month);
  const people = staffForMonth(data, month).length;
  const paid = slips.filter((p) => p.status === 'paid').length;
  return {
    month,
    slips,
    gross: slips.reduce((a, p) => a + p.gross, 0),
    net: slips.reduce((a, p) => a + p.net, 0),
    cost: slips.reduce((a, p) => a + employerCost(p), 0),
    status: !slips.length ? 'none' : paid === 0 ? 'draft' : paid >= Math.max(people, slips.length) ? 'paid' : 'partial',
  };
}

export const payrollHistory = (data: VaultData, n = 6, t = today()) => lastMonths(n, t).map((m) => payrollMonth(data, m));

/** Year-to-date totals for one person within a financial year (Form 16 / tax planning). */
export function staffYtd(data: VaultData, staffId: string, from: string, to = today()) {
  const slips = data.payslips.filter((p) => p.staffId === staffId && p.status === 'paid' && p.month >= from.slice(0, 7) && p.month <= to.slice(0, 7));
  const line = (re: RegExp) => slips.reduce((a, p) => a + p.deductions.filter((d) => re.test(d.label)).reduce((x, d) => x + d.amount, 0), 0);
  return {
    months: slips.length,
    gross: slips.reduce((a, p) => a + p.gross, 0),
    net: slips.reduce((a, p) => a + p.net, 0),
    tds: line(/^TDS/),
    pf: line(/Provident/),
    pt: line(/^Professional tax/),
  };
}

/** True from the 25th when people are on the books and this month's payroll hasn't been paid. */
export function payrollDue(data: VaultData, t = today()): boolean {
  const month = t.slice(0, 7);
  return Number(t.slice(8)) >= 25 && staffForMonth(data, month).length > 0 && payrollMonth(data, month).status !== 'paid';
}
