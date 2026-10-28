import { AlertTriangle, ArrowRight, Briefcase, CheckCircle2, Hourglass, Info, KeyRound, Receipt, TrendingUp, User, Wallet } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { AreaChart, Ring, Sparkline } from '../components/charts';
import { activityKey, activityOf, ActivityRow } from '../components/rows';
import { Bar, Corner, Empty, Seg } from '../components/ui';
import { balances, flow, insights, monthly, projectStats, runway, savingsRate, type Insight } from '../lib/analytics';
import { addDays, monthLabel, today } from '../lib/dates';
import { activeAccounts, investmentTotals, masked, sipsDue } from '../lib/accounts';
import { accountBalances } from '../lib/analytics';
import { occurrences } from '../lib/bills';
import { vaultHealth } from '../lib/passwords';
import { usePaySip } from './Accounts';
import { OverallCard } from './Budgets';
import { overallStatus } from '../lib/budgets';
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

/** A tinted summary tile: what it is, the number, how it moved, and its last six months. */
function Tile({ tone, icon, label, value, trend, color, children }: { tone: string; icon: ReactNode; label: string; value: string; trend: number[]; color: string; children: ReactNode }) {
  return (
    <div className={`card kpi t-${tone}`}>
      <div className="stat-l">
        <span className="kpi-ico">{icon}</span>
        {label}
      </div>
      <div className="stat-v num">{value}</div>
      <div className="kpi-foot">
        <span className="stat-d">{children}</span>
        <span className="kpi-spark">
          <Sparkline values={trend} color={color} height={28} />
        </span>
      </div>
    </div>
  );
}

export function Overview() {
  const { data, money } = useVault();
  const nav = useNav();
  const [book, setBook] = useState<Book | 'both'>('company');

  const t = today();
  const b = useMemo(() => balances(data), [data]);
  const series = useMemo(() => monthly(data, 12), [data]);
  const last6 = series.slice(-6);
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
  const accountTotals = useMemo(() => accountBalances(data).byAccount, [data]);
  const paySip = usePaySip();
  const dueSips = useMemo(() => sipsDue(data, addDays(t, 14)).slice(0, 4), [data, t]);
  // Investment accounts hold money, but not cash you can spend: show them separately.
  const invested = useMemo(() => ({ personal: investmentTotals(data, 'personal').value, company: investmentTotals(data, 'company').value }), [data]);
  const hasInvestments = data.accounts.some((a) => a.kind === 'investment' && !a.archived);
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
            <div className="hero-cap">
              {hasInvestments ? 'Cash and investments' : 'Cash'} across you and {company} today
            </div>
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
            <div className="pocket-v num">{money.full(b.personal - invested.personal)}</div>
          </div>
          <div className="pocket">
            <div className="pocket-l">
              <i className="swatch" style={{ background: 'var(--company)' }} />
              {company} cash
            </div>
            <div className="pocket-v num">{money.full(b.company - invested.company)}</div>
          </div>
          {hasInvestments && (
            <div className="pocket" style={{ cursor: 'pointer' }} onClick={() => nav.go('accounts')}>
              <div className="pocket-l">
                <i className="swatch" style={{ background: 'var(--income)' }} />
                Investments
                <ArrowRight size={13} style={{ marginLeft: 'auto' }} />
              </div>
              <div className="pocket-v num">{money.full(invested.personal + invested.company)}</div>
            </div>
          )}
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
            <Tile tone="green" icon={<Briefcase size={14} />} label={`${company} revenue`} value={money.compact(co.income)} trend={last6.map((p) => p.company.income)} color="var(--income)">
              <Delta now={co.income} before={coPrev.income} /> 30 days
            </Tile>
            <Tile tone="teal" icon={<Briefcase size={14} />} label={`${company} spend`} value={money.compact(co.expense)} trend={last6.map((p) => p.company.expense)} color="var(--company)">
              <Delta now={co.expense} before={coPrev.expense} invert /> 30 days
            </Tile>
            <Tile tone="violet" icon={<User size={14} />} label="Personal spend" value={money.compact(pe.expense)} trend={last6.map((p) => p.personal.expense)} color="var(--personal)">
              <Delta now={pe.expense} before={pePrev.expense} invert /> 30 days
            </Tile>
            <Tile
              tone="gold"
              icon={<Hourglass size={14} />}
              label={rw.months === null ? 'Company is profitable' : 'Company runway'}
              value={rw.months === null ? `+${money.compact(-rw.burn)}` : `${rw.months.toFixed(1)} mo`}
              trend={last6.map((p) => p.company.income - p.company.expense)}
              color="var(--gold)"
            >
              {rw.months === null ? 'avg surplus a month' : `burning ${money.compact(rw.burn)}/mo`}
              {sr !== null && ` · you save ${Math.round(sr * 100)}%`}
            </Tile>
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
                <Corner label="All insights" onClick={() => nav.go('insights')} />
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
                <Corner label="All transactions" onClick={() => nav.go('money')} />
              </div>
              <div className="list">
                {recent.map((a) => (
                  <ActivityRow key={activityKey(a)} a={a} />
                ))}
              </div>
            </div>
            <div className="stack" style={{ gap: 16 }}>
              {(['personal', 'company'] as Book[])
                .filter((bk) => data.settings.monthlyBudget[bk] > 0)
                .map((bk) => (
                  <div key={bk} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => nav.go('budgets')} onKeyDown={(e) => e.key === 'Enter' && nav.go('budgets')}>
                    <OverallCard o={overallStatus(data, bk)} isCurrent compact title={`${bk === 'company' ? company : 'Your'} budget this month`} />
                  </div>
                ))}
              {data.accounts.length > 0 && (
                <div className="card">
                  <div className="card-h">
                    <h2>Accounts &amp; cash</h2>
                    <Corner label="All accounts" onClick={() => nav.go('accounts')} />
                  </div>
                  <div className="stack" style={{ gap: 9 }}>
                    {activeAccounts(data).map((a) => (
                      <div key={a.id} className="row" style={{ gap: 10, cursor: 'pointer' }} onClick={() => nav.go('accounts')}>
                        <i className="swatch" style={{ background: a.color }} />
                        <span className="tx-t" style={{ flex: 1, fontSize: 13.5 }}>
                          {a.name}
                          {a.number && <span className="faint"> {masked(a.number)}</span>}
                        </span>
                        <span className={`num ${(accountTotals.get(a.id) ?? 0) < 0 ? 'down' : ''}`} style={{ fontSize: 13, fontWeight: 600 }}>
                          {money.compact(accountTotals.get(a.id) ?? 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(dueBills.length > 0 || dueSips.length > 0) && (
                <div className="card">
                  <div className="card-h">
                    <h2>Due soon</h2>
                    <Corner label="All bills" onClick={() => nav.go('bills')} />
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
                    {dueSips.map((sip) => (
                      <div key={sip.id} className="row" style={{ gap: 10 }}>
                        <TrendingUp size={15} style={{ color: 'var(--income)', flex: 'none' }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="tx-t" style={{ fontSize: 13.5 }}>
                            SIP · {sip.name}
                          </div>
                          <div className={sip.nextDue < t ? 'down' : 'faint'} style={{ fontSize: 12 }}>
                            {sip.nextDue < t ? 'Overdue' : sip.nextDue === t ? 'Today' : `Due ${sip.nextDue.slice(8)} ${monthLabel(sip.nextDue.slice(0, 7))}`}
                          </div>
                        </div>
                        <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
                          {money.compact(sip.amount)}
                        </span>
                        <button className="btn sm" onClick={() => paySip(sip)}>
                          Done
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="card">
                <div className="card-h">
                  <h2>Active projects</h2>
                  <Corner label="All projects" onClick={() => nav.go('projects')} />
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
