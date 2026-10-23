import { AlertTriangle, ArrowRight, Briefcase, CheckCircle2, Info, KeyRound, Receipt, User, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AreaChart, Ring, Sparkline } from '../components/charts';
import { activityOf, ActivityRow } from '../components/rows';
import { Bar, Empty, Seg } from '../components/ui';
import { balances, flow, insights, monthly, projectStats, runway, savingsRate, type Insight } from '../lib/analytics';
import { addDays, monthLabel, today } from '../lib/dates';
import { occurrences } from '../lib/bills';
import { vaultHealth } from '../lib/passwords';
import { usePayBill } from './Bills';
import type { Book } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';

export const InsightIcon = ({ tone }: { tone: Insight['tone'] }) => (
  <div className={`insight-ico ${tone}`}>{tone === 'good' ? <CheckCircle2 size={16} /> : tone === 'warn' ? <AlertTriangle size={16} /> : <Info size={16} />}</div>
);

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Delta({ now, before, invert }: { now: number; before: number; invert?: boolean }) {
  if (!before) return null;
  const pct = (now - before) / before;
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <span className={`delta ${good ? 'good' : 'bad'}`}>
      {pct >= 0 ? '↑' : '↓'} {Math.abs(Math.round(pct * 100))}%
    </span>
  );
}

export function Overview() {
  const { data, money } = useVault();
  const nav = useNav();
  const [book, setBook] = useState<Book | 'both'>('company');

  const t = today();
  const b = useMemo(() => balances(data), [data]);
  const series = useMemo(() => monthly(data, 12), [data]);
  const last30 = { from: addDays(t, -29), to: t };
  const prev30 = { from: addDays(t, -59), to: addDays(t, -30) };
  const co = flow(data, 'company', last30.from, last30.to);
  const coPrev = flow(data, 'company', prev30.from, prev30.to);
  const pe = flow(data, 'personal', last30.from, last30.to);
  const pePrev = flow(data, 'personal', prev30.from, prev30.to);
  const rw = runway(data);
  const sr = savingsRate(data);
  const notes = useMemo(() => insights(data, money.compact), [data, money]);
  const health = useMemo(() => vaultHealth(data.secrets), [data.secrets]);
  const recent = useMemo(() => activityOf(data.transactions, data.transfers).slice(0, 7), [data.transactions, data.transfers]);
  const active = data.projects.filter((p) => p.status === 'active').slice(0, 4);
  const name = data.settings.ownerName;
  const company = data.settings.companyName || 'Company';
  const isEmpty = !data.transactions.length && !data.transfers.length;
  const pay = usePayBill();
  const dueBills = useMemo(() => {
    const seen = new Set<string>();
    return occurrences(data.bills, t, addDays(t, 14)).filter((o) => !seen.has(o.bill.id) && seen.add(o.bill.id)).slice(0, 5);
  }, [data.bills, t]);

  const chartSeries =
    book === 'both'
      ? [
          { name: 'Personal net', color: 'var(--personal)', values: series.map((p) => Math.max(0, p.personal.income - p.personal.expense)) },
          { name: `${company} net`, color: 'var(--company)', values: series.map((p) => Math.max(0, p.company.income - p.company.expense)) },
        ]
      : [
          { name: 'Money in', color: 'var(--income)', values: series.map((p) => p[book].income) },
          { name: 'Money out', color: 'var(--expense)', values: series.map((p) => p[book].expense), dashed: false },
        ];

  const healthColor = health.score >= 80 ? 'var(--income)' : health.score >= 50 ? 'var(--warn)' : 'var(--expense)';

  return (
    <>
      <section className="hero">
        <div className="row between wrap" style={{ alignItems: 'flex-start' }}>
          <div>
            <p className="hero-greet">
              {greeting()}
              {name ? `, ${name}` : ''}
            </p>
            <p className="hero-total num">{money.full(b.personal + b.company)}</p>
            <div className="hero-cap">Cash across you and {company} today</div>
          </div>
          <div style={{ width: 220, maxWidth: '100%' }}>
            <Sparkline values={series.map((_, i) => series.slice(0, i + 1).reduce((s, p) => s + p.personal.income - p.personal.expense + p.company.income - p.company.expense, 0))} color="var(--gold)" height={56} />
            <div className="faint" style={{ fontSize: 11.5, textAlign: 'right', marginTop: 4 }}>
              Cumulative net, 12 months
            </div>
          </div>
        </div>
        <div className="pockets">
          <div className="pocket">
            <div className="pocket-l">
              <i className="swatch" style={{ background: 'var(--personal)' }} />
              Personal cash
            </div>
            <div className="pocket-v num">{money.full(b.personal)}</div>
          </div>
          <div className="pocket">
            <div className="pocket-l">
              <i className="swatch" style={{ background: 'var(--company)' }} />
              {company} cash
            </div>
            <div className="pocket-v num">{money.full(b.company)}</div>
          </div>
          <div className="pocket" style={{ cursor: 'pointer' }} onClick={() => nav.go('owner')}>
            <div className="pocket-l">
              <i className="swatch" style={{ background: 'var(--gold)' }} />
              {company} owes you
              <ArrowRight size={13} style={{ marginLeft: 'auto' }} />
            </div>
            <div className="pocket-v num">{money.full(b.owedToYou)}</div>
          </div>
        </div>
      </section>

      {isEmpty ? (
        <div className="card mt">
          <Empty
            icon={<Wallet size={22} />}
            title="Add your first entry"
            action={
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <button className="btn primary" onClick={() => nav.open({ type: 'tx', defaults: { book: 'company', kind: 'income' } })}>
                  Record income
                </button>
                <button className="btn" onClick={() => nav.open({ type: 'tx', defaults: { book: 'personal', kind: 'expense' } })}>
                  Record an expense
                </button>
                <button className="btn ghost" onClick={() => nav.go('settings')}>
                  Set opening balances
                </button>
              </div>
            }
          >
            Kosh fills in charts, runway and insights as you go. Press <kbd>N</kbd> anywhere to add an entry, or <kbd>⌘K</kbd> to do anything.
          </Empty>
        </div>
      ) : (
        <>
          <div className="grid g-4 mt">
            <div className="card">
              <div className="stat-l">
                <Briefcase size={14} /> {company} revenue
              </div>
              <div className="stat-v num">{money.compact(co.income)}</div>
              <div className="stat-d">
                <Delta now={co.income} before={coPrev.income} /> last 30 days
              </div>
            </div>
            <div className="card">
              <div className="stat-l">
                <Briefcase size={14} /> {company} spend
              </div>
              <div className="stat-v num">{money.compact(co.expense)}</div>
              <div className="stat-d">
                <Delta now={co.expense} before={coPrev.expense} invert /> last 30 days
              </div>
            </div>
            <div className="card">
              <div className="stat-l">
                <User size={14} /> Personal spend
              </div>
              <div className="stat-v num">{money.compact(pe.expense)}</div>
              <div className="stat-d">
                <Delta now={pe.expense} before={pePrev.expense} invert /> last 30 days
              </div>
            </div>
            <div className="card">
              <div className="stat-l">{rw.months === null ? 'Company is profitable' : 'Company runway'}</div>
              <div className="stat-v num">{rw.months === null ? `+${money.compact(-rw.burn)}` : `${rw.months.toFixed(1)} mo`}</div>
              <div className="stat-d">
                {rw.months === null ? 'avg monthly surplus' : `burning ${money.compact(rw.burn)}/mo`}
                {sr !== null && ` · you save ${Math.round(sr * 100)}%`}
              </div>
            </div>
          </div>

          <div className="grid g-main mt">
            <div className="card">
              <div className="card-h">
                <div>
                  <h2>Cash flow</h2>
                  <div className="sub">Last 12 months</div>
                </div>
                <Seg
                  label="Book"
                  value={book}
                  onChange={setBook}
                  options={[
                    { value: 'company', label: 'Company' },
                    { value: 'personal', label: 'Personal' },
                    { value: 'both', label: 'Net' },
                  ]}
                />
              </div>
              <AreaChart labels={series.map((p) => monthLabel(p.key))} tipTitle={(i) => monthLabel(series[i].key, true)} series={chartSeries} format={money.full} height={250} />
              <div className="legend mt">
                {chartSeries.map((s) => (
                  <span key={s.name}>
                    <i className="swatch" style={{ background: s.color }} />
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-h">
                <h2>What to know</h2>
                <button className="btn ghost sm" onClick={() => nav.go('insights')}>
                  All insights <ArrowRight size={13} />
                </button>
              </div>
              {notes.slice(0, 4).map((n, i) => (
                <div key={i} className="insight">
                  <InsightIcon tone={n.tone} />
                  <div>
                    <b>{n.title}</b>
                    <span>{n.detail}</span>
                  </div>
                </div>
              ))}
              {!notes.length && <p className="muted">Insights appear once there are a few weeks of entries.</p>}
            </div>
          </div>

          <div className="grid g-main mt">
            <div className="card flush">
              <div className="card-h" style={{ padding: '18px 20px 0' }}>
                <h2>Recent activity</h2>
                <button className="btn ghost sm" onClick={() => nav.go('money')}>
                  View all <ArrowRight size={13} />
                </button>
              </div>
              <div className="list">
                {recent.map((a) => (
                  <ActivityRow key={a.kind === 'tx' ? a.tx.id : a.tr.id} a={a} />
                ))}
              </div>
            </div>
            <div className="stack" style={{ gap: 16 }}>
              {dueBills.length > 0 && (
                <div className="card">
                  <div className="card-h">
                    <h2>Bills due soon</h2>
                    <button className="btn ghost sm" onClick={() => nav.go('bills')}>
                      All bills <ArrowRight size={13} />
                    </button>
                  </div>
                  <div className="stack" style={{ gap: 10 }}>
                    {dueBills.map(({ bill, date }) => (
                      <div key={bill.id} className="row" style={{ gap: 10 }}>
                        <Receipt size={15} style={{ color: bill.book === 'company' ? 'var(--company)' : 'var(--personal)', flex: 'none' }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="tx-t" style={{ fontSize: 13.5 }}>
                            {bill.name}
                          </div>
                          <div className={date < t ? 'down' : 'faint'} style={{ fontSize: 12 }}>
                            {date < t ? 'Overdue' : date === t ? 'Today' : `Due ${date.slice(8)} ${monthLabel(date.slice(0, 7))}`}
                          </div>
                        </div>
                        <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
                          {money.compact(bill.amount)}
                        </span>
                        <button className="btn sm" onClick={() => pay(bill)}>
                          Pay
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="card">
                <div className="card-h">
                  <h2>Active projects</h2>
                  <button className="btn ghost sm" onClick={() => nav.go('projects')}>
                    All <ArrowRight size={13} />
                  </button>
                </div>
                {active.length === 0 && <p className="muted" style={{ margin: 0 }}>No active projects.</p>}
                <div className="stack" style={{ gap: 14 }}>
                  {active.map((p) => {
                    const s = projectStats(data, p);
                    return (
                      <div key={p.id} style={{ cursor: 'pointer' }} onClick={() => nav.go('projects', { projectId: p.id })}>
                        <div className="row between" style={{ marginBottom: 6 }}>
                          <span className="row" style={{ gap: 8, fontWeight: 550 }}>
                            <i className="swatch" style={{ background: p.color }} />
                            {p.name}
                          </span>
                          <span className={`num ${s.profit >= 0 ? 'up' : 'down'}`} style={{ fontSize: 13, fontWeight: 600 }}>
                            {s.profit >= 0 ? '+' : '−'}
                            {money.compact(Math.abs(s.profit))}
                          </span>
                        </div>
                        <Bar value={s.burn ?? 0} color={(s.burn ?? 0) > 1 ? 'var(--expense)' : p.color} />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="card" style={{ cursor: 'pointer' }} onClick={() => nav.go('vault')}>
                <div className="row" style={{ gap: 16 }}>
                  <Ring value={health.score / 100} size={76} color={healthColor}>
                    <span className="num" style={{ fontWeight: 650, fontSize: 18 }}>
                      {health.score}
                    </span>
                  </Ring>
                  <div>
                    <div className="row" style={{ gap: 8, fontWeight: 600 }}>
                      <KeyRound size={15} /> Password health
                    </div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      {health.total === 0
                        ? 'No logins saved yet.'
                        : `${health.weak.length} weak · ${health.reused.reduce((n, g) => n + g.length, 0)} reused · ${health.old.length} over a year old`}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
