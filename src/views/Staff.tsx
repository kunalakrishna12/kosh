import { Banknote, CalendarClock, FileText, Pencil, Plus, Printer, Trash2, UserPlus, Users } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Bars } from '../components/charts';
import { AccountSelect } from '../components/forms';
import { Empty, Field, Modal, useToast } from '../components/ui';
import { defaultAccountId, masked } from '../lib/accounts';
import { dayLabel, isoDate, lastMonths, monthLabel, today } from '../lib/dates';
import { amountInWords } from '../lib/invoices';
import { toInput, toMinor } from '../lib/money';
import {
  computePayslip,
  daysEmployed,
  emptyStructure,
  employerCost,
  ESI_GROSS_LIMIT,
  monthlyGross,
  noInputs,
  payPayroll,
  payrollHistory,
  payrollMonth,
  splitGross,
  staffForMonth,
  staffMonthlyCost,
  staffYtd,
  statutoryDues,
  type PayInputs,
} from '../lib/payroll';
import { periods } from '../lib/reports';
import { STAFF_TYPE_LABEL, type Payslip, type SalaryStructure, type Staff, type StaffType } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';
import { DateInput } from '../components/DateInput';

const isActive = (s: Staff, t = today()) => s.joinDate <= t && (!s.exitDate || s.exitDate >= t);

/** Prints just the open payslip (shares the invoice print styles). */
function printPaper() {
  document.documentElement.classList.add('print-invoice');
  const done = () => {
    document.documentElement.classList.remove('print-invoice');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

export function StaffView() {
  const { data, money } = useVault();
  const nav = useNav();
  const [open, setOpen] = useState<string | null>(null);
  const [slip, setSlip] = useState<Payslip | null>(null);
  const [showPast, setShowPast] = useState(false);
  const t = today();
  const month = t.slice(0, 7);

  const active = data.staff.filter((s) => isActive(s, t));
  const monthlyTotal = active.reduce((a, s) => a + staffMonthlyCost(s), 0);
  const thisMonth = payrollMonth(data, month);
  const history = useMemo(() => payrollHistory(data, 6), [data]);
  const fy = periods(data.settings.fyStartMonth, t).find((p) => p.id === 'this-fy')!;
  const paidFy = data.payslips.filter((p) => p.status === 'paid' && p.month >= fy.from.slice(0, 7)).reduce((a, p) => a + employerCost(p), 0);
  const list = data.staff.filter((s) => showPast || isActive(s, t) || s.joinDate > t).sort((a, b) => Number(isActive(b, t)) - Number(isActive(a, t)) || a.name.localeCompare(b.name));
  const openStaff = data.staff.find((s) => s.id === open);

  if (!data.staff.length) {
    return (
      <div className="card">
        <Empty
          icon={<Users size={22} />}
          title="Run payroll and issue payslips in minutes"
          action={
            <button className="btn primary" onClick={() => nav.open({ type: 'staff' })}>
              <UserPlus size={15} /> Add your first person
            </button>
          }
        >
          Add employees, interns and contractors with their salary structure. Each month Kosh works out PF, ESI, professional tax and TDS, prints payslips,
          records salaries as company expenses, and reminds you to deposit the dues.
        </Empty>
      </div>
    );
  }

  const STATUS: Record<typeof thisMonth.status, [string, string]> = {
    none: ['Not run yet', 'warn'],
    draft: ['Payslips ready, not paid', 'warn'],
    partial: ['Partly paid', 'warn'],
    paid: ['Paid', 'good'],
  };

  return (
    <>
      <div className="grid g-4">
        <div className="card kpi t-sky">
          <div className="stat-l">On the team</div>
          <div className="stat-v num">{active.length}</div>
          <div className="stat-d">
            {active.filter((s) => s.type === 'employee').length} employees · {active.filter((s) => s.type === 'intern').length} interns ·{' '}
            {active.filter((s) => s.type === 'contractor').length} contractors
          </div>
        </div>
        <div className="card kpi t-teal">
          <div className="stat-l">Monthly payroll cost</div>
          <div className="stat-v num">{money.compact(monthlyTotal)}</div>
          <div className="stat-d">pay plus employer PF and ESI</div>
        </div>
        <div className="card kpi t-green">
          <div className="stat-l">Paid in {fy.label.replace(' to date', '')}</div>
          <div className="stat-v num">{money.compact(paidFy)}</div>
          <div className="stat-d">full cost to the company</div>
        </div>
        <div className="card kpi t-gold" style={{ borderColor: thisMonth.status !== 'paid' ? 'color-mix(in srgb, var(--gold) 40%, transparent)' : undefined }}>
          <div className="stat-l">{monthLabel(month, true)} payroll</div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className={`pill ${STATUS[thisMonth.status][1]}`}>{STATUS[thisMonth.status][0]}</span>
            {thisMonth.status !== 'paid' && (
              <button className="btn primary sm" onClick={() => nav.open({ type: 'payroll', month })}>
                <Banknote size={14} /> Run payroll
              </button>
            )}
          </div>
          <div className="stat-d">{thisMonth.slips.length ? `${money.compact(thisMonth.net)} net pay · ${thisMonth.slips.length} payslips` : `${staffForMonth(data, month).length} people to pay`}</div>
        </div>
      </div>

      <div className="grid g-main mt">
        <div className="card flush">
          <div className="card-h" style={{ padding: '18px 20px 0' }}>
            <h2>People</h2>
            <div className="row" style={{ gap: 6 }}>
              {data.staff.some((s) => !isActive(s, t) && s.joinDate <= t) && (
                <button className="btn ghost sm" onClick={() => setShowPast(!showPast)}>
                  {showPast ? 'Hide past staff' : 'Show past staff'}
                </button>
              )}
              <button className="btn ghost sm" onClick={() => nav.open({ type: 'staff' })}>
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
          {list.map((s) => {
            const gross = monthlyGross(s.structure);
            const preview = computePayslip({ ...s, joinDate: '1900-01-01', exitDate: undefined }, month, noInputs(), 'preview');
            return (
              <div key={s.id} className="tx" style={{ gridTemplateColumns: '36px minmax(0,1.4fr) minmax(0,1fr) auto', opacity: isActive(s, t) || s.joinDate > t ? 1 : 0.55 }} onClick={() => setOpen(s.id)}>
                <div className="avatar">{s.name.slice(0, 1).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="tx-t">{s.name}</div>
                  <div className="tx-s">
                    {s.designation || STAFF_TYPE_LABEL[s.type]}
                    {s.employeeId && ` · ${s.employeeId}`}
                  </div>
                </div>
                <div className="tx-meta" style={{ flexDirection: 'column', gap: 2, fontSize: 12.5 }}>
                  <span className={`pill ${s.type === 'contractor' ? 'gold' : s.type === 'intern' ? 'personal' : 'company'}`} style={{ alignSelf: 'flex-start' }}>
                    {STAFF_TYPE_LABEL[s.type].split(' ')[0]}
                  </span>
                  <span className="faint">
                    {s.joinDate > t ? `joins ${dayLabel(s.joinDate)}` : s.exitDate && s.exitDate < t ? `left ${dayLabel(s.exitDate)}` : `since ${monthLabel(s.joinDate.slice(0, 7), true)}`}
                  </span>
                </div>
                <div className="tx-a num">
                  {money.full(gross)}
                  <div className="faint" style={{ fontSize: 11.5, fontWeight: 400 }}>
                    take-home {money.compact(preview.net)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-h">
              <div>
                <h2>Payroll by month</h2>
                <div className="sub">Cost to the company</div>
              </div>
            </div>
            <Bars labels={history.map((h) => monthLabel(h.month))} series={[{ name: 'Payroll cost', color: 'var(--company)', values: history.map((h) => h.cost) }]} format={money.full} height={170} />
          </div>
          <div className="card">
            <div className="card-h">
              <h2>Runs</h2>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {[...history].reverse().map((h) => (
                <div key={h.month} className="row" style={{ gap: 10 }}>
                  <CalendarClock size={15} style={{ color: h.status === 'paid' ? 'var(--income)' : 'var(--text-3)', flex: 'none' }} />
                  <span style={{ flex: 1, fontSize: 13.5 }}>{monthLabel(h.month, true)}</span>
                  <span className="num faint" style={{ fontSize: 12.5 }}>
                    {h.slips.length ? `${h.slips.length} · ${money.compact(h.net)}` : '—'}
                  </span>
                  <button className="btn ghost sm" onClick={() => nav.open({ type: 'payroll', month: h.month })}>
                    {h.status === 'paid' ? 'View' : 'Run'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {openStaff && (
        <StaffDetail
          s={openStaff}
          onClose={() => setOpen(null)}
          onSlip={(p) => {
            setOpen(null);
            setSlip(p);
          }}
        />
      )}
      {slip && <PayslipView slip={data.payslips.find((p) => p.id === slip.id) ?? slip} onClose={() => setSlip(null)} />}
    </>
  );
}

/* ───────── One person ───────── */

function StaffDetail({ s, onClose, onSlip }: { s: Staff; onClose: () => void; onSlip: (p: Payslip) => void }) {
  const { data, money } = useVault();
  const nav = useNav();
  const fy = periods(data.settings.fyStartMonth).find((p) => p.id === 'this-fy')!;
  const ytd = staffYtd(data, s.id, fy.from);
  const slips = data.payslips.filter((p) => p.staffId === s.id).sort((a, b) => (a.month < b.month ? 1 : -1));
  const preview = computePayslip({ ...s, joinDate: '1900-01-01', exitDate: undefined }, today().slice(0, 7), noInputs(), 'preview');
  const docs = data.docs.filter((d) => d.linkId === s.id);
  const facts: [string, string][] = [
    ['Employee ID', s.employeeId],
    ['Type', STAFF_TYPE_LABEL[s.type]],
    ['Joined', dayLabel(s.joinDate)],
    ['Left', s.exitDate ? dayLabel(s.exitDate) : ''],
    ['PAN', s.pan],
    ['UAN (PF)', s.uan],
    ['Bank', [s.bankName, s.accountNumber && masked(s.accountNumber), s.ifsc].filter(Boolean).join(' · ')],
    ['Email', s.email],
    ['Phone', s.phone],
  ];
  return (
    <Modal
      wide
      title={
        <span className="row">
          <span className="avatar">{s.name.slice(0, 1).toUpperCase()}</span>
          {s.name}
          <span className="faint" style={{ fontWeight: 400, fontSize: 14 }}>
            {s.designation}
          </span>
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={() => (onClose(), nav.open({ type: 'staff', initial: s }))}>
            <Pencil size={14} /> Edit
          </button>
          <div className="right">
            <label className="btn" style={{ cursor: 'pointer' }}>
              <FileText size={15} /> Add document
              <input type="file" hidden onChange={(e) => e.target.files?.[0] && (onClose(), nav.open({ type: 'upload', files: [e.target.files[0]], defaults: { folder: 'contracts', book: 'company', linkId: s.id } }))} />
            </label>
          </div>
        </>
      }
    >
      <div className="grid g-2" style={{ gap: 16, alignItems: 'start' }}>
        <div className="acct-details">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="row between" style={{ gap: 12 }}>
                <span className="faint">{k}</span>
                <span className="mono" style={{ textAlign: 'right' }}>
                  {v}
                </span>
              </div>
            ))}
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <div className="pocket">
            <div className="pocket-l">Monthly gross · take-home</div>
            <div className="pocket-v num" style={{ fontSize: 19 }}>
              {money.full(preview.gross)} · {money.full(preview.net)}
            </div>
          </div>
          <div className="pocket">
            <div className="pocket-l">This financial year (paid)</div>
            <div className="pocket-v num" style={{ fontSize: 19 }}>
              {money.full(ytd.gross)}
            </div>
            <div className="faint" style={{ fontSize: 12 }}>
              {ytd.months} months · TDS {money.full(ytd.tds)} · PF {money.full(ytd.pf)} · PT {money.full(ytd.pt)}
            </div>
          </div>
          {docs.length > 0 && (
            <div className="faint" style={{ fontSize: 12.5 }}>
              Documents: {docs.map((d) => d.name).join(', ')}
            </div>
          )}
        </div>
      </div>
      <div className="card flush mt" style={{ boxShadow: 'none', maxHeight: 260, overflowY: 'auto' }}>
        {slips.length === 0 && (
          <p className="muted" style={{ padding: 20, margin: 0 }}>
            No payslips yet. They appear here after you run payroll.
          </p>
        )}
        {slips.map((p) => (
          <div key={p.id} className="tx" style={{ gridTemplateColumns: '36px minmax(0,1fr) auto auto' }} onClick={() => onSlip(p)}>
            <div className="tx-ico company">
              <FileText size={16} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="tx-t">Payslip · {monthLabel(p.month, true)}</div>
              <div className="tx-s">
                {p.paidDays}/{p.daysInMonth} days{p.lopDays ? ` · ${p.lopDays} LOP` : ''} · gross {money.full(p.gross)}
              </div>
            </div>
            <span className={`pill ${p.status === 'paid' ? 'good' : 'warn'}`}>{p.status === 'paid' ? `Paid ${p.paidOn ? dayLabel(p.paidOn) : ''}` : 'Not paid'}</span>
            <div className="tx-a num">{money.full(p.net)}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ───────── Payslip ───────── */

function PayslipView({ slip, onClose }: { slip: Payslip; onClose: () => void }) {
  const { data, money } = useVault();
  const c = data.settings.company;
  const s = slip.snapshot;
  const rows = Math.max(slip.earnings.length, slip.deductions.length);
  return (
    <Modal
      wide
      title={`Payslip · ${s.name} · ${monthLabel(slip.month, true)}`}
      onClose={onClose}
      footer={
        <div className="right">
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={printPaper}>
            <Printer size={15} /> Print / PDF
          </button>
        </div>
      }
    >
      <div className="paper">
        <div className="paper-head">
          <div>
            <div className="paper-company">{c.legalName || data.settings.companyName || 'Your company'}</div>
            <div className="paper-small" style={{ whiteSpace: 'pre-line' }}>
              {c.address}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="paper-title">PAYSLIP</div>
            <div className="paper-small">
              for <b>{new Date(Number(slip.month.slice(0, 4)), Number(slip.month.slice(5)) - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })}</b>
            </div>
            {slip.status === 'paid' && slip.paidOn && <div className="paper-small">Paid on {slip.paidOn}</div>}
          </div>
        </div>

        <div className="slip-grid">
          {(
            [
              ['Name', s.name],
              ['Employee ID', s.employeeId],
              ['Designation', s.designation],
              ['Date of joining', s.joinDate],
              ['PAN', s.pan],
              ['UAN', s.uan],
              ['Bank', [s.bankName, s.accountNumber && masked(s.accountNumber)].filter(Boolean).join(' ')],
              ['Days paid', `${slip.paidDays} of ${slip.daysInMonth}${slip.lopDays ? ` (${slip.lopDays} LOP)` : ''}`],
            ] as [string, string][]
          )
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <span className="paper-label">{k}</span>
                <div>{v}</div>
              </div>
            ))}
        </div>

        <table className="paper-table slip-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>{s.type === 'contractor' ? 'Fee' : 'Earnings'}</th>
              <th>Amount</th>
              <th style={{ textAlign: 'left' }}>Deductions</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'left' }}>{slip.earnings[i]?.label}</td>
                <td>{slip.earnings[i] ? money.full(slip.earnings[i].amount) : ''}</td>
                <td style={{ textAlign: 'left' }}>{slip.deductions[i]?.label}</td>
                <td>{slip.deductions[i] ? money.full(slip.deductions[i].amount) : ''}</td>
              </tr>
            ))}
            <tr className="slip-total">
              <td style={{ textAlign: 'left' }}>Gross earnings</td>
              <td>{money.full(slip.gross)}</td>
              <td style={{ textAlign: 'left' }}>Total deductions</td>
              <td>{money.full(slip.totalDeductions)}</td>
            </tr>
          </tbody>
        </table>

        <div className="paper-totals">
          <div className="paper-words">
            <div className="paper-label">Net pay in words</div>
            <div>{amountInWords(slip.net, data.settings.currency)}</div>
            {slip.employer.length > 0 && (
              <div className="paper-small" style={{ marginTop: 8 }}>
                Employer contributions (not deducted from pay): {slip.employer.map((e) => `${e.label} ${money.full(e.amount)}`).join(' · ')}
              </div>
            )}
          </div>
          <table>
            <tbody>
              <tr className="grand">
                <td>Net pay</td>
                <td>{money.full(slip.net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="paper-foot">
          <div className="paper-small">This is a computer-generated payslip and does not need a signature.</div>
        </div>
      </div>
    </Modal>
  );
}

/* ───────── Payroll run ───────── */

type Draft = { lop: string; bonus: string; reimbursement: string; deduction: string };
const emptyDraft = (): Draft => ({ lop: '', bonus: '', reimbursement: '', deduction: '' });

export function PayrollRun({ month: initialMonth, onClose }: { month?: string; onClose: () => void }) {
  const { data, update, money } = useVault();
  const toast = useToast();
  const [month, setMonth] = useState(initialMonth ?? today().slice(0, 7));
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [paying, setPaying] = useState(false);
  const [date, setDate] = useState(() => {
    const [y, m] = (initialMonth ?? today().slice(0, 7)).split('-').map(Number);
    const end = isoDate(new Date(y, m, 0));
    return end < today() ? end : today();
  });
  const [accountId, setAccountId] = useState(() => defaultAccountId(data, 'company') ?? '');
  const [viewing, setViewing] = useState<Payslip | null>(null);

  const people = staffForMonth(data, month);
  const existing = data.payslips.filter((p) => p.month === month);
  const paidFor = new Set(existing.filter((p) => p.status === 'paid').map((p) => p.staffId));
  const toInputs = (d: Draft | undefined): PayInputs => ({
    lopDays: Math.max(0, Math.floor(Number(d?.lop || 0))),
    bonus: toMinor(d?.bonus ?? '') ?? 0,
    reimbursement: toMinor(d?.reimbursement ?? '') ?? 0,
    deduction: toMinor(d?.deduction ?? '') ?? 0,
    deductionLabel: 'Advance recovery',
  });
  const computed = people.filter((s) => !paidFor.has(s.id)).map((s) => computePayslip(s, month, toInputs(drafts[s.id])));
  const all = [...existing.filter((p) => p.status === 'paid'), ...computed];
  const totals = {
    gross: all.reduce((a, p) => a + p.gross, 0),
    deductions: all.reduce((a, p) => a + p.totalDeductions, 0),
    net: all.reduce((a, p) => a + p.net, 0),
    cost: all.reduce((a, p) => a + employerCost(p), 0),
  };
  const dues = statutoryDues(computed, month);
  const set = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? emptyDraft()), ...patch } }));

  /** Replaces this month's unpaid payslips with the ones on screen. */
  const saveSlips = (pay: boolean) => {
    update((d) => {
      const kept = d.payslips.filter((p) => !(p.month === month && p.status === 'draft'));
      const next = { ...d, payslips: [...kept, ...computed] };
      return pay ? payPayroll(next, computed.map((p) => p.id), date, accountId || undefined) : next;
    });
  };

  return (
    <Modal
      wide
      title={`Payroll · ${monthLabel(month, true)}`}
      onClose={onClose}
      footer={
        computed.length ? (
          <>
            <button
              className="btn ghost"
              onClick={() => {
                saveSlips(false);
                toast(`${computed.length} payslips saved (not paid)`);
                onClose();
              }}
            >
              Save payslips only
            </button>
            <div className="right">
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn primary" onClick={() => setPaying(true)} disabled={paying}>
                <Banknote size={15} /> Pay {money.full(computed.reduce((a, p) => a + p.net, 0))}
              </button>
            </div>
          </>
        ) : (
          <div className="right">
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        )
      }
    >
      <div className="row between wrap" style={{ marginBottom: 12 }}>
        <select className="select" style={{ width: 'auto', height: 36 }} value={month} onChange={(e) => (setMonth(e.target.value), setDrafts({}), setPaying(false))} aria-label="Month">
          {lastMonths(12)
            .reverse()
            .map((m) => (
              <option key={m} value={m}>
                {monthLabel(m, true)}
              </option>
            ))}
        </select>
        <span className="faint" style={{ fontSize: 12.5 }}>
          LOP = days without pay. Bonus and reimbursement are one-off for this month.
        </span>
      </div>

      {people.length === 0 ? (
        <Empty icon={<Users size={22} />} title="Nobody was on the books this month" />
      ) : (
        <div className="payroll-table">
          <div className="payroll-row payroll-head">
            <span>Person</span>
            <span>LOP days</span>
            <span>Bonus</span>
            <span>Reimburse</span>
            <span>Recover</span>
            <span>Gross</span>
            <span>Deductions</span>
            <span>Net pay</span>
          </div>
          {people.map((s) => {
            const paid = existing.find((p) => p.staffId === s.id && p.status === 'paid');
            const p = paid ?? computed.find((x) => x.staffId === s.id)!;
            const d = drafts[s.id] ?? emptyDraft();
            const partial = daysEmployed(s, month) < p.daysInMonth;
            return (
              <div key={s.id} className={`payroll-row ${paid ? 'done' : ''}`}>
                <button className="fund-name" onClick={() => setViewing(p)} title="Preview payslip">
                  <span className="avatar sm">{s.name.slice(0, 1).toUpperCase()}</span>
                  <span>
                    {s.name}
                    <small className="faint" style={{ display: 'block', fontSize: 11.5 }}>
                      {paid ? `Paid ${paid.paidOn ? dayLabel(paid.paidOn) : ''}` : partial ? `${daysEmployed(s, month)} days on the books` : STAFF_TYPE_LABEL[s.type].split(' ')[0]}
                    </small>
                  </span>
                </button>
                {paid ? (
                  <span className="faint" style={{ gridColumn: 'span 4', fontSize: 12.5 }}>
                    Paid. Open the payslip to view or print it.
                  </span>
                ) : (
                  <>
                    <input className="input num" inputMode="numeric" value={d.lop} onChange={(e) => set(s.id, { lop: e.target.value.replace(/\D/g, '') })} placeholder="0" aria-label={`Loss of pay days for ${s.name}`} />
                    <input className="input num" inputMode="decimal" value={d.bonus} onChange={(e) => set(s.id, { bonus: e.target.value })} placeholder="0" aria-label={`Bonus for ${s.name}`} />
                    <input className="input num" inputMode="decimal" value={d.reimbursement} onChange={(e) => set(s.id, { reimbursement: e.target.value })} placeholder="0" aria-label={`Reimbursement for ${s.name}`} />
                    <input className="input num" inputMode="decimal" value={d.deduction} onChange={(e) => set(s.id, { deduction: e.target.value })} placeholder="0" aria-label={`Advance recovery for ${s.name}`} />
                  </>
                )}
                <span className="num">{money.full(p.gross)}</span>
                <span className="num faint">{money.full(p.totalDeductions)}</span>
                <b className="num">{money.full(p.net)}</b>
              </div>
            );
          })}
          <div className="payroll-row payroll-total">
            <span>Total</span>
            <span style={{ gridColumn: 'span 4' }} className="faint">
              Cost to company {money.full(totals.cost)}
            </span>
            <span className="num">{money.full(totals.gross)}</span>
            <span className="num">{money.full(totals.deductions)}</span>
            <b className="num">{money.full(totals.net)}</b>
          </div>
        </div>
      )}

      {paying && computed.length > 0 && (
        <div className="card mt" style={{ background: 'var(--bg-2)' }}>
          <div className="form-grid">
            <Field label="Paid on">
              <DateInput value={date} onChange={(v) => setDate(v || today())} />
            </Field>
            <AccountSelect book="company" value={accountId} onChange={setAccountId} label="Paid from" />
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '12px 0' }}>
            Records {computed.length} salary payments ({money.full(computed.reduce((a, p) => a + p.net, 0))}) as company expenses
            {dues.length > 0 && (
              <>
                , and adds these deposits to Bills: {dues.map((x) => `${x.name} ${money.full(x.amount)} by ${dayLabel(x.due)}`).join(' · ')}
              </>
            )}
            .
          </p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost sm" onClick={() => setPaying(false)}>
              Back
            </button>
            <button
              className="btn primary sm"
              onClick={() => {
                saveSlips(true);
                toast(`${monthLabel(month, true)} payroll paid · ${computed.length} payslips`);
                onClose();
              }}
            >
              Confirm and pay
            </button>
          </div>
        </div>
      )}
      {viewing && <PayslipView slip={viewing} onClose={() => setViewing(null)} />}
    </Modal>
  );
}

/* ───────── Add / edit a person ───────── */

export function StaffForm({ initial, onClose }: { initial?: Staff; onClose: () => void }) {
  const { data, update, money } = useVault();
  const toast = useToast();
  const [p, setP] = useState<Staff>(
    () =>
      initial ?? {
        id: crypto.randomUUID(),
        name: '',
        designation: '',
        employeeId: `${(data.settings.company.invoicePrefix || 'E').replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase() || 'E'}-${String(data.staff.length + 1).padStart(3, '0')}`,
        type: 'employee',
        email: '',
        phone: '',
        pan: '',
        uan: '',
        bankName: '',
        accountNumber: '',
        ifsc: '',
        joinDate: today(),
        structure: emptyStructure(),
        notes: '',
        createdAt: Date.now(),
      },
  );
  const st = p.structure;
  const [money_, setMoney] = useState<Record<'basic' | 'hra' | 'special' | 'other' | 'pt' | 'tds', string>>({
    basic: st.basic ? toInput(st.basic) : '',
    hra: st.hra ? toInput(st.hra) : '',
    special: st.special ? toInput(st.special) : '',
    other: st.other ? toInput(st.other) : '',
    pt: toInput(st.ptMonthly),
    tds: st.tdsMonthly ? toInput(st.tdsMonthly) : '',
  });
  const [grossQuick, setGrossQuick] = useState('');
  const [error, setError] = useState('');
  const set = (patch: Partial<Staff>) => setP((x) => ({ ...x, ...patch }));
  const setS = (patch: Partial<SalaryStructure>) => setP((x) => ({ ...x, structure: { ...x.structure, ...patch } }));
  const amount = (k: keyof typeof money_, v: string) => setMoney((m) => ({ ...m, [k]: v.replace(/[^\d.,]/g, '') }));
  const parsed = (v: string) => (v.trim() ? toMinor(v) ?? 0 : 0);
  const structure: SalaryStructure = {
    ...st,
    basic: parsed(money_.basic),
    hra: p.type === 'contractor' ? 0 : parsed(money_.hra),
    special: p.type === 'contractor' ? 0 : parsed(money_.special),
    other: p.type === 'contractor' ? 0 : parsed(money_.other),
    ptMonthly: parsed(money_.pt),
    tdsMonthly: parsed(money_.tds),
  };
  const preview = computePayslip({ ...p, structure, joinDate: '1900-01-01', exitDate: undefined }, today().slice(0, 7), noInputs(), 'preview');
  const contractor = p.type === 'contractor';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!p.name.trim()) return setError('Enter their name.');
    if (!structure.basic) return setError(contractor ? 'Enter the monthly fee.' : 'Enter at least the Basic salary, or use the quick split.');
    const out: Staff = { ...p, name: p.name.trim(), structure, exitDate: p.exitDate || undefined };
    update((d) => ({ ...d, staff: initial ? d.staff.map((x) => (x.id === out.id ? out : x)) : [...d.staff, out] }));
    toast(initial ? 'Saved' : `${out.name} added`);
    onClose();
  };

  return (
    <Modal
      wide
      title={initial ? `Edit ${initial.name}` : 'Add a person'}
      onClose={onClose}
      footer={
        <>
          {initial && !data.payslips.some((x) => x.staffId === initial.id) && (
            <button
              className="btn ghost danger"
              onClick={() => {
                update((d) => ({ ...d, staff: d.staff.filter((x) => x.id !== initial.id) }));
                toast('Removed');
                onClose();
              }}
            >
              <Trash2 size={15} /> Delete
            </button>
          )}
          <div className="right">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" form="staff-form">
              {initial ? 'Save' : 'Add'}
            </button>
          </div>
        </>
      }
    >
      <form id="staff-form" className="stack" onSubmit={submit} autoComplete="off">
        <div className="form-grid">
          <Field label="Full name">
            <input className="input" value={p.name} onChange={(e) => (set({ name: e.target.value }), setError(''))} autoFocus />
          </Field>
          <Field label="Designation">
            <input className="input" value={p.designation} onChange={(e) => set({ designation: e.target.value })} placeholder="Senior designer" />
          </Field>
          <Field label="Type">
            <select className="select" value={p.type} onChange={(e) => set({ type: e.target.value as StaffType, structure: { ...st, pf: e.target.value === 'employee' } })}>
              {(Object.keys(STAFF_TYPE_LABEL) as StaffType[]).map((k) => (
                <option key={k} value={k}>
                  {STAFF_TYPE_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Employee ID">
            <input className="input mono" value={p.employeeId} onChange={(e) => set({ employeeId: e.target.value })} />
          </Field>
          <Field label="Joined on">
            <DateInput value={p.joinDate} onChange={(v) => set({ joinDate: v || today() })} />
          </Field>
          <Field label="Last working day" hint="Leave empty while they're with you.">
            <DateInput value={p.exitDate ?? ''} onChange={(v) => set({ exitDate: v || undefined })} optional />
          </Field>
        </div>

        <div className="fx-box">
          <div className="row between wrap" style={{ marginBottom: 12 }}>
            <b style={{ fontSize: 13.5 }}>{contractor ? 'Monthly fee' : 'Monthly salary'}</b>
            {!contractor && (
              <div className="row" style={{ gap: 6 }}>
                <input className="input num" style={{ height: 32, width: 140 }} inputMode="decimal" value={grossQuick} onChange={(e) => setGrossQuick(e.target.value)} placeholder="Monthly gross" aria-label="Monthly gross to split" />
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    const g = toMinor(grossQuick);
                    if (!g) return;
                    const x = splitGross(g);
                    setMoney((m) => ({ ...m, basic: toInput(x.basic), hra: toInput(x.hra), special: toInput(x.special), other: '' }));
                    setS({ esi: g <= ESI_GROSS_LIMIT });
                  }}
                >
                  Split it for me
                </button>
              </div>
            )}
          </div>
          <div className="grid g-4" style={{ gap: 12 }}>
            <Field label={contractor ? 'Fee' : 'Basic'}>
              <input className="input num" inputMode="decimal" value={money_.basic} onChange={(e) => (amount('basic', e.target.value), setError(''))} placeholder="0" />
            </Field>
            {!contractor && (
              <>
                <Field label="HRA">
                  <input className="input num" inputMode="decimal" value={money_.hra} onChange={(e) => amount('hra', e.target.value)} placeholder="0" />
                </Field>
                <Field label="Special allowance">
                  <input className="input num" inputMode="decimal" value={money_.special} onChange={(e) => amount('special', e.target.value)} placeholder="0" />
                </Field>
                <Field label="Other allowances">
                  <input className="input num" inputMode="decimal" value={money_.other} onChange={(e) => amount('other', e.target.value)} placeholder="0" />
                </Field>
              </>
            )}
          </div>
          <div className="grid g-4 mt" style={{ gap: 12, alignItems: 'end' }}>
            {contractor ? (
              <Field label="TDS %" hint="194J professional fees 10% · 194C contracts 1–2%">
                <input className="input num" inputMode="decimal" value={st.tdsPct} onChange={(e) => setS({ tdsPct: Math.min(30, Number(e.target.value.replace(/[^\d.]/g, '')) || 0) })} />
              </Field>
            ) : (
              <>
                <label className="check">
                  <input type="checkbox" checked={st.pf} onChange={(e) => setS({ pf: e.target.checked })} />
                  PF (12% of Basic, max ₹1,800)
                </label>
                <label className="check">
                  <input type="checkbox" checked={st.esi} onChange={(e) => setS({ esi: e.target.checked })} />
                  ESI (gross up to {money.full(ESI_GROSS_LIMIT)})
                </label>
                <Field label="Professional tax / month">
                  <input className="input num" inputMode="decimal" value={money_.pt} onChange={(e) => amount('pt', e.target.value)} />
                </Field>
                <Field label="TDS / month" hint="From their tax projection for the year.">
                  <input className="input num" inputMode="decimal" value={money_.tds} onChange={(e) => amount('tds', e.target.value)} placeholder="0" />
                </Field>
              </>
            )}
          </div>
          <div className="fx-sum">
            Gross <b className="num">{money.full(preview.gross)}</b> − deductions {money.full(preview.totalDeductions)} = take-home <b className="num">{money.full(preview.net)}</b> · cost to
            company {money.full(employerCost(preview))}
          </div>
        </div>

        <div className="form-grid">
          <Field label="PAN">
            <input className="input mono" value={p.pan} onChange={(e) => set({ pan: e.target.value.toUpperCase() })} maxLength={10} />
          </Field>
          {!contractor && (
            <Field label="UAN (PF)">
              <input className="input mono" value={p.uan} onChange={(e) => set({ uan: e.target.value.replace(/\D/g, '') })} maxLength={12} />
            </Field>
          )}
          <Field label="Bank">
            <input className="input" value={p.bankName} onChange={(e) => set({ bankName: e.target.value })} />
          </Field>
          <Field label="Account number">
            <input className="input mono" value={p.accountNumber} onChange={(e) => set({ accountNumber: e.target.value.replace(/[^\dA-Za-z]/g, '') })} />
          </Field>
          <Field label="IFSC">
            <input className="input mono" value={p.ifsc} onChange={(e) => set({ ifsc: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={p.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className="input" value={p.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Notes" className="full">
            <input className="input" value={p.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Notice period, laptop issued, emergency contact…" />
          </Field>
        </div>
        {error && <div className="error-text">{error}</div>}
      </form>
    </Modal>
  );
}
