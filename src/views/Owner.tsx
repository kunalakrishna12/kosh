import { ArrowLeft, ArrowLeftRight, ArrowRight, Briefcase, User } from 'lucide-react';
import { useMemo } from 'react';
import { Bars } from '../components/charts';
import { activityOf, ActivityRow } from '../components/rows';
import { Empty } from '../components/ui';
import { balances } from '../lib/analytics';
import { lastMonths, monthKey, monthLabel } from '../lib/dates';
import { TO_COMPANY } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';

export function Owner() {
  const { data, money } = useVault();
  const nav = useNav();
  const company = data.settings.companyName || 'Company';
  const b = useMemo(() => balances(data), [data]);

  const sums = useMemo(() => {
    const s = { capital: 0, loan: 0, salary: 0, dividend: 0, repayment: 0, reimbursement: 0, paidPersonally: 0 };
    for (const t of data.transfers) s[t.reason] += t.amount;
    for (const t of data.transactions) if (t.paidPersonally) s.paidPersonally += t.amount;
    return s;
  }, [data]);

  const months = useMemo(() => lastMonths(12), []);
  const chart = useMemo(() => {
    const idx = new Map(months.map((m, i) => [m, i]));
    const putIn = months.map(() => 0);
    const tookOut = months.map(() => 0);
    for (const t of data.transfers) {
      const i = idx.get(monthKey(t.date));
      if (i === undefined) continue;
      (TO_COMPANY.includes(t.reason) ? putIn : tookOut)[i] += t.amount;
    }
    for (const t of data.transactions) {
      const i = idx.get(monthKey(t.date));
      if (i !== undefined && t.paidPersonally) putIn[i] += t.amount;
    }
    return { putIn, tookOut };
  }, [data, months]);

  const rows = useMemo(
    () =>
      activityOf(
        data.transactions.filter((t) => t.paidPersonally),
        data.transfers,
      ),
    [data],
  );

  const putIn = sums.capital + sums.loan + sums.paidPersonally;
  const tookOut = sums.salary + sums.dividend + sums.repayment + sums.reimbursement;

  return (
    <>
      <h2 className="section-title">You and {company}</h2>
      <p className="section-sub">Every rupee that moves between your pocket and the business, and what the business still owes you.</p>

      <div className="card">
        <div className="owner-flow">
          <div className="owner-node">
            <div className="stat-l">
              <User size={14} style={{ color: 'var(--personal)' }} /> You
            </div>
            <div className="stat-v num">{money.full(b.personal)}</div>
            <div className="stat-d">personal cash</div>
          </div>
          <div className="owner-arrows">
            <div className="arrow">
              <ArrowRight size={14} style={{ color: 'var(--company)' }} />
              Put in <b className="num">{money.compact(putIn)}</b>
            </div>
            <div className="arrow">
              <ArrowLeft size={14} style={{ color: 'var(--personal)' }} />
              Taken out <b className="num">{money.compact(tookOut)}</b>
            </div>
          </div>
          <div className="owner-node">
            <div className="stat-l">
              <Briefcase size={14} style={{ color: 'var(--company)' }} /> {company}
            </div>
            <div className="stat-v num">{money.full(b.company)}</div>
            <div className="stat-d">company cash</div>
          </div>
        </div>
      </div>

      <div className="grid g-4 mt">
        <div className="card" style={{ borderColor: b.owedToYou > 0 ? 'color-mix(in srgb, var(--gold) 35%, transparent)' : undefined }}>
          <div className="stat-l">{company} owes you</div>
          <div className="stat-v num" style={{ color: b.owedToYou > 0 ? 'var(--gold)' : undefined }}>
            {money.full(b.owedToYou)}
          </div>
          <div className="stat-d">
            loans {money.compact(sums.loan)} + bills you paid {money.compact(sums.paidPersonally)} − paid back {money.compact(sums.repayment + sums.reimbursement)}
          </div>
        </div>
        <div className="card">
          <div className="stat-l">Capital invested</div>
          <div className="stat-v num">{money.full(sums.capital)}</div>
          <div className="stat-d">equity, not paid back</div>
        </div>
        <div className="card">
          <div className="stat-l">Drawn this year</div>
          <div className="stat-v num">{money.full(b.drawnThisYear)}</div>
          <div className="stat-d">salary and dividends</div>
        </div>
        <div className="card">
          <div className="stat-l">Bills you paid for {company}</div>
          <div className="stat-v num">{money.full(sums.paidPersonally)}</div>
          <div className="stat-d">reimbursed {money.compact(sums.reimbursement)}</div>
        </div>
      </div>

      <div className="grid g-main mt">
        <div className="card">
          <div className="card-h">
            <div>
              <h2>Money moved</h2>
              <div className="sub">Last 12 months</div>
            </div>
            <div className="legend">
              <span>
                <i className="swatch" style={{ background: 'var(--company)' }} />
                You → {company}
              </span>
              <span>
                <i className="swatch" style={{ background: 'var(--personal)' }} />
                {company} → You
              </span>
            </div>
          </div>
          <Bars
            labels={months.map((m) => monthLabel(m))}
            series={[
              { name: `You → ${company}`, color: 'var(--company)', values: chart.putIn },
              { name: `${company} → You`, color: 'var(--personal)', values: chart.tookOut },
            ]}
            format={money.full}
          />
        </div>
        <div className="card">
          <div className="card-h">
            <h2>How this works</h2>
          </div>
          <div className="stack" style={{ fontSize: 13, color: 'var(--text-2)', gap: 10 }}>
            <p style={{ margin: 0 }}>
              <b style={{ color: 'var(--text)' }}>Capital</b> is ownership. <b style={{ color: 'var(--text)' }}>Loans</b> and{' '}
              <b style={{ color: 'var(--text)' }}>company bills you paid personally</b> are debts the company owes you.
            </p>
            <p style={{ margin: 0 }}>
              <b style={{ color: 'var(--text)' }}>Salary</b> counts as your income and a company cost. <b style={{ color: 'var(--text)' }}>Dividends</b> are your
              income but not a company cost.
            </p>
            <button className="btn primary" onClick={() => nav.open({ type: 'transfer' })}>
              <ArrowLeftRight size={15} /> Move money
            </button>
          </div>
        </div>
      </div>

      <div className="card flush mt">
        <div className="card-h" style={{ padding: '18px 20px 0' }}>
          <h2>Ledger</h2>
          <span className="sub">{rows.length} entries</span>
        </div>
        {rows.length ? (
          <div className="list">
            {rows.map((a) => (
              <ActivityRow key={a.kind === 'tx' ? a.tx.id : a.tr.id} a={a} />
            ))}
          </div>
        ) : (
          <Empty icon={<ArrowLeftRight size={22} />} title="Nothing has moved yet">
            Record capital you put in, salary you draw, or a company bill you paid from your own card.
          </Empty>
        )}
      </div>
    </>
  );
}
