import { AlertTriangle, CheckCircle2, Download, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AreaChart } from '../components/charts';
import { download, Seg } from '../components/ui';
import { billSummary } from '../lib/bills';
import { addDays, monthLabel, parseDate } from '../lib/dates';
import { forecast, periods, statement, taxSummary, type Statement } from '../lib/reports';
import type { Book } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';

const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n');

/** The same-length window immediately before [from, to]. */
function previous(from: string, to: string) {
  const days = Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
  return { from: addDays(from, -days - 1), to: addDays(from, -1) };
}

function Change({ now, before, invert }: { now: number; before: number; invert?: boolean }) {
  if (!before) return <span className="faint">—</span>;
  const pct = (now - before) / Math.abs(before);
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <span className={good ? 'up' : 'down'} style={{ fontSize: 12, fontWeight: 600 }}>
      {pct >= 0 ? '+' : ''}
      {Math.round(pct * 100)}%
    </span>
  );
}

function StatementTable({ s, prev, title }: { s: Statement; prev: Statement; title: string }) {
  const { money } = useVault();
  const prevOf = (list: Statement['income'], cat: string) => list.find((x) => x.category === cat)?.amount ?? 0;
  const Line = ({ label, now, before, strong, invert }: { label: string; now: number; before: number; strong?: boolean; invert?: boolean }) => (
    <tr className={strong ? 'total' : ''}>
      <td>{label}</td>
      <td className="num">{money.full(now)}</td>
      <td className="num faint">{money.full(before)}</td>
      <td>
        <Change now={now} before={before} invert={invert} />
      </td>
    </tr>
  );
  return (
    <table className="statement">
      <thead>
        <tr>
          <th>{title}</th>
          <th>This period</th>
          <th>Previous</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr className="group">
          <td colSpan={4}>Income</td>
        </tr>
        {s.income.map((r) => (
          <Line key={r.category} label={r.category} now={r.amount} before={prevOf(prev.income, r.category)} />
        ))}
        <Line label="Total income" now={s.totalIncome} before={prev.totalIncome} strong />
        <tr className="group">
          <td colSpan={4}>Expenses</td>
        </tr>
        {s.expense.map((r) => (
          <Line key={r.category} label={r.category} now={r.amount} before={prevOf(prev.expense, r.category)} invert />
        ))}
        <Line label="Total expenses" now={s.totalExpense} before={prev.totalExpense} strong invert />
        <tr className={`net ${s.net >= 0 ? 'up' : 'down'}`}>
          <td>{s.net >= 0 ? 'Net profit' : 'Net loss'}</td>
          <td className="num">{money.full(s.net)}</td>
          <td className="num faint">{money.full(prev.net)}</td>
          <td>{s.margin !== null && <span style={{ fontSize: 12 }}>{Math.round(s.margin * 100)}% margin</span>}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function Reports() {
  const { data, money } = useVault();
  const nav = useNav();
  const company = data.settings.companyName || 'Company';
  const all = useMemo(() => periods(data.settings.fyStartMonth), [data.settings.fyStartMonth]);
  const [periodId, setPeriodId] = useState('this-fy');
  const [book, setBook] = useState<Book>('company');
  const p = all.find((x) => x.id === periodId) ?? all[0];
  const prevRange = previous(p.from, p.to);

  const s = useMemo(() => statement(data, book, p.from, p.to), [data, book, p.from, p.to]);
  const prev = useMemo(() => statement(data, book, prevRange.from, prevRange.to), [data, book, prevRange.from, prevRange.to]);
  const tax = useMemo(() => taxSummary(data, p.from, p.to), [data, p.from, p.to]);
  const fc = useMemo(() => forecast(data, book), [data, book]);

  // What an accountant would ask you to sort out before closing the books.
  const checks = useMemo(() => {
    const inPeriod = data.transactions.filter((t) => t.date >= p.from && t.date <= p.to);
    const bills = billSummary(data);
    return [
      { ok: !inPeriod.some((t) => t.category === 'Other'), text: `${inPeriod.filter((t) => t.category === 'Other').length} entries filed under "Other"`, okText: 'Every entry has a real category', go: () => nav.go('money') },
      {
        ok: !inPeriod.some((t) => t.book === 'company' && t.kind === 'income' && !t.taxRate),
        text: `${inPeriod.filter((t) => t.book === 'company' && t.kind === 'income' && !t.taxRate).length} company income entries have no GST rate`,
        okText: 'GST recorded on all company income',
        go: () => nav.go('money'),
      },
      { ok: bills.overdue.length === 0, text: `${bills.overdue.length} bills overdue`, okText: 'No overdue bills', go: () => nav.go('bills') },
      {
        ok: !data.transactions.some((t) => t.paidPersonally) || data.transfers.some((t) => t.reason === 'reimbursement'),
        text: 'Company bills you paid personally are not yet reimbursed',
        okText: 'Personal payments for the company are tracked',
        go: () => nav.go('owner'),
      },
    ];
  }, [data, p.from, p.to, nav]);

  const exportPL = () => {
    const rows: (string | number)[][] = [[`${book === 'company' ? company : 'Personal'} profit & loss`, p.label, `${p.from} to ${p.to}`], [], ['Section', 'Category', 'Amount']];
    for (const r of s.income) rows.push(['Income', r.category, (r.amount / 100).toFixed(2)]);
    rows.push(['Income', 'TOTAL', (s.totalIncome / 100).toFixed(2)]);
    for (const r of s.expense) rows.push(['Expenses', r.category, (r.amount / 100).toFixed(2)]);
    rows.push(['Expenses', 'TOTAL', (s.totalExpense / 100).toFixed(2)]);
    rows.push(['Net', s.net >= 0 ? 'Profit' : 'Loss', (s.net / 100).toFixed(2)]);
    download(new Blob([csv(rows)], { type: 'text/csv' }), `kosh-pnl-${book}-${p.from}-${p.to}.csv`);
  };

  const exportTax = () => {
    const rows: (string | number)[][] = [['date', 'type', 'category', 'note', 'rate_%', 'gross', 'taxable_value', 'tax']];
    for (const t of data.transactions) {
      if (t.book !== 'company' || !t.taxRate || t.date < p.from || t.date > p.to) continue;
      const taxAmt = Math.round((t.amount * t.taxRate) / (100 + t.taxRate));
      rows.push([t.date, t.kind === 'income' ? 'sale' : 'purchase', t.category, t.note, t.taxRate, (t.amount / 100).toFixed(2), ((t.amount - taxAmt) / 100).toFixed(2), (taxAmt / 100).toFixed(2)]);
    }
    download(new Blob([csv(rows)], { type: 'text/csv' }), `kosh-gst-${p.from}-${p.to}.csv`);
  };

  const lowest = fc.lowest;

  return (
    <>
      <div className="row between wrap no-print" style={{ marginBottom: 18 }}>
        <div className="row wrap">
          <select className="select" style={{ width: 'auto', height: 36 }} value={periodId} onChange={(e) => setPeriodId(e.target.value)} aria-label="Period">
            {all.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <Seg
            label="Book"
            value={book}
            onChange={setBook}
            options={[
              { value: 'company', label: company },
              { value: 'personal', label: 'Personal' },
            ]}
          />
        </div>
        <div className="row wrap">
          <button className="btn" onClick={exportPL}>
            <Download size={15} /> P&amp;L CSV
          </button>
          {book === 'company' && (
            <button className="btn" onClick={exportTax}>
              <Download size={15} /> GST CSV
            </button>
          )}
          <button className="btn" onClick={() => window.print()}>
            <Printer size={15} /> Print / PDF
          </button>
        </div>
      </div>

      <div className="print-only">
        <h1 style={{ margin: 0 }}>{book === 'company' ? company : data.settings.ownerName || 'Personal'} · Profit &amp; loss</h1>
        <p className="muted">
          {p.label} · {p.from} to {p.to} · compared with {prevRange.from} to {prevRange.to}
        </p>
      </div>

      <div className="grid g-4">
        <div className="card kpi t-green">
          <div className="stat-l">Income</div>
          <div className="stat-v num">{money.compact(s.totalIncome)}</div>
          <div className="stat-d">
            <Change now={s.totalIncome} before={prev.totalIncome} /> vs previous
          </div>
        </div>
        <div className="card kpi t-rose">
          <div className="stat-l">Expenses</div>
          <div className="stat-v num">{money.compact(s.totalExpense)}</div>
          <div className="stat-d">
            <Change now={s.totalExpense} before={prev.totalExpense} invert /> vs previous
          </div>
        </div>
        <div className="card kpi t-gold">
          <div className="stat-l">{s.net >= 0 ? 'Net profit' : 'Net loss'}</div>
          <div className={`stat-v num ${s.net >= 0 ? 'up' : 'down'}`}>{money.compact(s.net)}</div>
          <div className="stat-d">{s.margin === null ? '—' : `${Math.round(s.margin * 100)}% margin`}</div>
        </div>
        {book === 'company' ? (
          <div className="card kpi t-sky">
            <div className="stat-l">{tax.net >= 0 ? 'GST payable' : 'GST credit'}</div>
            <div className="stat-v num">{money.compact(Math.abs(tax.net))}</div>
            <div className="stat-d">
              collected {money.compact(tax.collected)} − paid {money.compact(tax.paid)}
            </div>
          </div>
        ) : (
          <div className="card kpi t-violet">
            <div className="stat-l">Savings rate</div>
            <div className="stat-v num">{s.margin === null ? '—' : `${Math.round(s.margin * 100)}%`}</div>
            <div className="stat-d">of income kept</div>
          </div>
        )}
      </div>

      <div className="grid g-main mt">
        <div className="card">
          <div className="card-h">
            <div>
              <h2>Profit &amp; loss</h2>
              <div className="sub">
                {p.label} · {p.from} → {p.to}
              </div>
            </div>
          </div>
          {s.income.length + s.expense.length === 0 ? <p className="muted">No entries in this period.</p> : <StatementTable s={s} prev={prev} title={book === 'company' ? company : 'Personal'} />}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          {book === 'company' && (
            <div className="card">
              <div className="card-h">
                <div>
                  <h2>GST summary</h2>
                  <div className="sub">From the tax rate on each entry</div>
                </div>
              </div>
              <div className="stack" style={{ gap: 6, fontSize: 13.5 }}>
                <div className="row between">
                  <span className="muted">Output tax (on sales)</span>
                  <b className="num">{money.full(tax.collected)}</b>
                </div>
                <div className="row between">
                  <span className="muted">Input tax credit (on purchases)</span>
                  <b className="num">− {money.full(tax.paid)}</b>
                </div>
                <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 4 }}>
                  <b>{tax.net >= 0 ? 'Net payable' : 'Credit carried forward'}</b>
                  <b className="num" style={{ color: 'var(--gold)' }}>
                    {money.full(Math.abs(tax.net))}
                  </b>
                </div>
              </div>
              {tax.byRate.length > 0 && (
                <table className="statement mini mt">
                  <thead>
                    <tr>
                      <th>Rate</th>
                      <th>Sales</th>
                      <th>Purchases</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tax.byRate.map((r) => (
                      <tr key={r.rate}>
                        <td>{r.rate}%</td>
                        <td className="num">{money.compact(r.sales)}</td>
                        <td className="num">{money.compact(r.purchases)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="faint" style={{ fontSize: 12, margin: '12px 0 0' }}>
                An estimate to plan with. Your CA files the actual return.
              </p>
            </div>
          )}
          <div className="card no-print">
            <div className="card-h">
              <h2>Ready for your accountant?</h2>
            </div>
            {checks.map((c, i) => (
              <div key={i} className="issue" style={{ gridTemplateColumns: '28px 1fr auto' }}>
                <div className={`insight-ico ${c.ok ? 'good' : 'warn'}`} style={{ width: 28, height: 28 }}>
                  {c.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                </div>
                <span style={{ fontSize: 13 }}>{c.ok ? c.okText : c.text}</span>
                {!c.ok && (
                  <button className="btn sm ghost" onClick={c.go}>
                    Review
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card mt">
        <div className="card-h">
          <div>
            <h2>Cash forecast · {book === 'company' ? company : 'Personal'}</h2>
            <div className="sub">6 months of history, 6 months ahead from your scheduled bills and average income and spending</div>
          </div>
          {lowest && (
            <span className={`pill ${lowest.cash < 0 ? 'bad' : 'good'}`}>
              Lowest: {money.compact(lowest.cash)} in {monthLabel(lowest.key, true)}
            </span>
          )}
        </div>
        <AreaChart
          labels={fc.points.map((x) => monthLabel(x.key, true))}
          series={[
            { name: 'Cash', color: book === 'company' ? 'var(--company)' : 'var(--personal)', values: fc.points.map((x) => x.actual) },
            { name: 'Forecast', color: 'var(--gold)', values: fc.points.map((x) => x.projected), dashed: true },
          ]}
          format={money.full}
          height={240}
        />
        {lowest && lowest.cash < 0 && (
          <p className="down" style={{ margin: '12px 0 0', fontSize: 13 }}>
            At this pace {book === 'company' ? company : 'your account'} runs out of cash around {monthLabel(lowest.key, true)}. Bring in revenue sooner, delay a
            bill, or move money in from {book === 'company' ? 'your personal account' : 'savings'}.
          </p>
        )}
      </div>
    </>
  );
}
