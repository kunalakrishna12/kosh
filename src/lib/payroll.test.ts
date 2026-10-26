import { describe, expect, it } from 'vitest';
import { computePayslip, daysEmployed, emptyStructure, employerCost, noInputs, payPayroll, payrollMonth, splitGross, statutoryDues, staffYtd } from './payroll';
import { emptyVault, type Staff } from './types';

const person = (patch: Partial<Staff> = {}): Staff => ({
  id: 'p1',
  name: 'Priya',
  designation: 'Designer',
  employeeId: 'E-1',
  type: 'employee',
  email: '',
  phone: '',
  pan: 'ABCDE1234F',
  uan: '',
  bankName: '',
  accountNumber: '',
  ifsc: '',
  joinDate: '2025-01-01',
  structure: { ...emptyStructure(), ...splitGross(60_000_00), ptMonthly: 200_00, tdsMonthly: 2_000_00 },
  notes: '',
  createdAt: 0,
  ...patch,
});

describe('payslip', () => {
  it('splits a gross into Basic / HRA / Special', () => {
    expect(splitGross(60_000_00)).toEqual({ basic: 30_000_00, hra: 15_000_00, special: 15_000_00, other: 0 });
  });

  it('a full month: PF capped at ₹1,800, PT and TDS deducted', () => {
    const p = computePayslip(person(), '2026-10');
    expect(p.gross).toBe(60_000_00);
    expect(p.deductions).toEqual([
      { label: 'Provident fund (12%)', amount: 1_800_00 },
      { label: 'Professional tax', amount: 200_00 },
      { label: 'TDS (income tax)', amount: 2_000_00 },
    ]);
    expect(p.net).toBe(60_000_00 - 4_000_00);
    expect(employerCost(p)).toBe(61_800_00);
  });

  it('prorates loss-of-pay days and mid-month joiners', () => {
    const lop = computePayslip(person(), '2026-10', { ...noInputs(), lopDays: 2 });
    expect(lop.paidDays).toBe(29);
    expect(lop.gross).toBe(Math.round((60_000_00 * 29) / 31 / 100) * 100);
    expect(daysEmployed(person({ joinDate: '2026-10-16' }), '2026-10')).toBe(16);
    expect(daysEmployed(person({ exitDate: '2026-09-30' }), '2026-10')).toBe(0);
  });

  it('ESI applies at ₹21,000 or less; bonus counts, reimbursement is paid but not taxed', () => {
    const intern = person({ structure: { ...emptyStructure(), basic: 15_000_00, pf: false, esi: true, ptMonthly: 0 } });
    const p = computePayslip(intern, '2026-10', { ...noInputs(), bonus: 1_000_00, reimbursement: 500_00 });
    expect(p.gross).toBe(16_500_00);
    expect(p.deductions).toEqual([{ label: 'ESI (0.75%)', amount: 120_00 }]); // 0.75% of ₹16,000, rounded up
    expect(p.employer).toEqual([{ label: 'Employer ESI (3.25%)', amount: 520_00 }]);
  });

  it('contractors: fee with TDS, no PF/ESI/PT', () => {
    const c = person({ type: 'contractor', structure: { ...emptyStructure(), basic: 40_000_00, tdsPct: 10 } });
    const p = computePayslip(c, '2026-10');
    expect(p.earnings).toEqual([{ label: 'Professional fee', amount: 40_000_00 }]);
    expect(p.deductions).toEqual([{ label: 'TDS @ 10%', amount: 4_000_00 }]);
    expect(p.net).toBe(36_000_00);
  });
});

describe('paying payroll', () => {
  it('records net pay as expenses and government dues as one-time bills', () => {
    const slip = computePayslip(person(), '2026-10', noInputs(), 's1');
    const v = payPayroll({ ...emptyVault(), staff: [person()], payslips: [slip] }, ['s1'], '2026-10-31', 'bank');
    expect(v.transactions).toHaveLength(1);
    expect(v.transactions[0]).toMatchObject({ amount: 56_000_00, category: 'Payroll', accountId: 'bank', book: 'company' });
    expect(v.bills.map((b) => [b.name.split(' · ')[0], b.amount, b.nextDue, b.once])).toEqual([
      ['TDS on salaries', 2_000_00, '2026-11-07', true],
      ['PF & ESI contributions', 3_600_00, '2026-11-15', true],
      ['Professional tax', 200_00, '2026-11-10', true],
    ]);
    // Net pay + dues = gross + employer contributions: the full cost is accounted for.
    expect(56_000_00 + 2_000_00 + 3_600_00 + 200_00).toBe(employerCost(slip));
    expect(payrollMonth(v, '2026-10').status).toBe('paid');
    expect(staffYtd(v, 'p1', '2026-04-01', '2026-12-31')).toMatchObject({ months: 1, gross: 60_000_00, tds: 2_000_00, pf: 1_800_00 });
    // Paying again does nothing.
    expect(payPayroll(v, ['s1'], '2026-10-31')).toBe(v);
  });

  it('only lists dues that exist', () => {
    const c = person({ type: 'contractor', structure: { ...emptyStructure(), basic: 10_000_00, tdsPct: 0 } });
    expect(statutoryDues([computePayslip(c, '2026-10')], '2026-10')).toEqual([]);
  });
});
