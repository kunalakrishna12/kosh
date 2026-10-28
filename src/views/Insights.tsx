import { AlertTriangle, Clock, Copy as CopyIcon, KeyRound, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bars, CATEGORY_COLORS, Donut } from '../components/charts';
import { Empty, Seg } from '../components/ui';
import { byCategory, flow, insights, monthly, runway, savingsRate } from '../lib/analytics';
import { addDays, dayLabel, monthLabel, today } from '../lib/dates';
import { vaultHealth } from '../lib/passwords';
import type { Book, Secret } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';
import { InsightIcon } from './Overview';

type Range = '3' | '6' | '12';

function CategoryCard({ book, from, to }: { book: Book; from: string; to: string }) {
  const { data, money } = useVault();
  const slices = useMemo(() => byCategory(data, book, 'expense', from, to), [data, book, from, to]);
  const top = slices.slice(0, 7);
  const rest = slices.slice(7).reduce((s, x) => s + x.amount, 0);
  const total = slices.reduce((s, x) => s + x.amount, 0);
  const rows = rest ? [...top, { category: 'Everything else', amount: rest, share: rest / total }] : top;
  const company = data.settings.companyName || 'Company';
  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h2>{book === 'personal' ? 'Where your money goes' : `Where ${company}'s money goes`}</h2>
          <div className="sub">Spending by category</div>
        </div>
        <span className={`pill ${book}`}>{book === 'personal' ? 'Personal' : 'Company'}</span>
      </div>
      {total === 0 ? (
        <p className="muted">No spending in this period.</p>
      ) : (
        <div className="donut-wrap">
          <Donut
            slices={rows.map((r, i) => ({ value: r.amount, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length], label: r.category }))}
            center={
              <div>
                <div className="faint" style={{ fontSize: 11 }}>
                  Total
                </div>
                <div className="num" style={{ fontWeight: 650, fontSize: 17 }}>
                  {money.compact(total)}
                </div>
              </div>
            }
          />
          <div>
            {rows.map((r, i) => (
              <div key={r.category} className="cat-row">
                <i className="swatch" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                <span>{r.category}</span>
                <span className="num">{money.compact(r.amount)}</span>
                <span className="share num">{Math.round(r.share * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IssueList({ title, icon, items, why }: { title: string; icon: React.ReactNode; items: Secret[]; why: string }) {
  const nav = useNav();
  if (!items.length) return null;
  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h2>
            {title} · {items.length}
          </h2>
          <div className="sub">{why}</div>
        </div>
      </div>
      {items.slice(0, 6).map((s) => (
        <div key={s.id} className="issue">
          <div className="insight-ico warn">{icon}</div>
          <div style={{ minWidth: 0 }}>
            <div className="tx-t">{s.title}</div>
            <div className="tx-s">{s.username || s.url}</div>
          </div>
          <button className="btn sm" onClick={() => nav.open({ type: 'secret', initial: s })}>
            Fix
          </button>
        </div>
      ))}
    </div>
  );
}

export function Insights() {
  const { data, money } = useVault();
  const [range, setRange] = useState<Range>('6');
  const [book, setBook] = useState<Book>('company');
  const t = today();
  const months = Number(range);
  const from = addDays(t, -months * 30);

  const notes = useMemo(() => insights(data, money.compact), [data, money]);
  const series = useMemo(() => monthly(data, months), [data, months]);
  const co = flow(data, 'company', from, t);
  const pe = flow(data, 'personal', from, t);
  const rw = runway(data);
  const sr = savingsRate(data, Math.min(months, 12));
  const health = useMemo(() => vaultHealth(data.secrets), [data.secrets]);

  const biggest = useMemo(
    () =>
      data.transactions
        .filter((x) => x.kind === 'expense' && x.date >= from && x.date <= t)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6),
    [data.transactions, from, t],
  );

  if (!data.transactions.length && !data.secrets.length) {
    return (
      <div className="card">
        <Empty icon={<Sparkles size={22} />} title="Insights need a little history">
          Add a few weeks of entries and logins, and Kosh will point out spending spikes, runway, project margins and risky passwords.
        </Empty>
      </div>
    );
  }

  const margin = co.income ? (co.income - co.expense) / co.income : null;

  return (
    <>
      <div className="row between wrap" style={{ marginBottom: 18 }}>
        <div>
          <h2 className="section-title">Insights</h2>
          <p className="section-sub" style={{ margin: 0 }}>
            Worked out on this device from your own data.
          </p>
        </div>
        <Seg
          label="Range"
          value={range}
          onChange={setRange}
          options={[
            { value: '3', label: '3 months' },
            { value: '6', label: '6 months' },
            { value: '12', label: '12 months' },
          ]}
        />
      </div>

      <div className="grid g-4">
        <div className="card kpi t-teal">
          <div className="stat-l">Company margin</div>
          <div className={`stat-v num ${margin !== null && margin < 0 ? 'down' : ''}`}>{margin === null ? '—' : `${Math.round(margin * 100)}%`}</div>
          <div className="stat-d">
            {money.compact(co.income - co.expense)} profit on {money.compact(co.income)}
          </div>
        </div>
        <div className="card kpi t-gold">
          <div className="stat-l">Runway</div>
          <div className="stat-v num">{rw.months === null ? 'Profitable' : `${rw.months.toFixed(1)} months`}</div>
          <div className="stat-d">{rw.months === null ? `+${money.compact(-rw.burn)} a month` : `${money.compact(rw.burn)} net burn a month`}</div>
        </div>
        <div className="card kpi t-violet">
          <div className="stat-l">Personal savings rate</div>
          <div className="stat-v num">{sr === null ? '—' : `${Math.round(sr * 100)}%`}</div>
          <div className="stat-d">{money.compact(pe.income - pe.expense)} kept</div>
        </div>
        <div className="card kpi t-sky">
          <div className="stat-l">Avg personal spend</div>
          <div className="stat-v num">{money.compact(Math.round(pe.expense / months))}</div>
          <div className="stat-d">per month</div>
        </div>
      </div>

      <div className="grid g-main mt">
        <div className="card">
          <div className="card-h">
            <div>
              <h2>Earned vs spent</h2>
              <div className="sub">By month</div>
            </div>
            <Seg
              label="Book"
              value={book}
              onChange={setBook}
              options={[
                { value: 'company', label: 'Company' },
                { value: 'personal', label: 'Personal' },
              ]}
            />
          </div>
          <Bars
            labels={series.map((p) => monthLabel(p.key, months > 6))}
            series={[
              { name: 'Earned', color: 'var(--income)', values: series.map((p) => p[book].income) },
              { name: 'Spent', color: 'var(--expense)', values: series.map((p) => p[book].expense) },
            ]}
            format={money.full}
            height={250}
          />
        </div>
        <div className="card">
          <div className="card-h">
            <h2>Observations</h2>
          </div>
          {notes.length ? (
            notes.map((n, i) => (
              <div key={i} className="insight">
                <InsightIcon tone={n.tone} />
                <div>
                  <b>{n.title}</b>
                  <span>{n.detail}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">Nothing unusual right now.</p>
          )}
        </div>
      </div>

      <div className="grid g-2 mt">
        <CategoryCard book="company" from={from} to={t} />
        <CategoryCard book="personal" from={from} to={t} />
      </div>

      {biggest.length > 0 && (
        <div className="card mt">
          <div className="card-h">
            <h2>Largest expenses</h2>
            <span className="sub">in the last {months} months</span>
          </div>
          {biggest.map((x) => (
            <div key={x.id} className="cat-row" style={{ gridTemplateColumns: '10px 1fr auto auto', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <i className="swatch" style={{ background: x.book === 'personal' ? 'var(--personal)' : 'var(--company)' }} />
              <span>
                {x.note || x.category} <span className="faint">· {x.category}</span>
              </span>
              <span className="faint" style={{ fontSize: 12 }}>
                {dayLabel(x.date)}
              </span>
              <b className="num">{money.full(x.amount)}</b>
            </div>
          ))}
        </div>
      )}

      {health.total > 0 && (
        <>
          <h2 className="section-title mt-lg">Password health</h2>
          <p className="section-sub">
            Score {health.score}/100 across {health.total} logins.
          </p>
          <div className="grid g-3">
            <IssueList title="Weak" icon={<AlertTriangle size={15} />} items={health.weak} why="Easy to guess or crack" />
            <IssueList title="Reused" icon={<CopyIcon size={15} />} items={health.reused.flat()} why="One leak unlocks every account sharing it" />
            <IssueList title="Not changed in a year" icon={<Clock size={15} />} items={health.old} why="Older passwords are more likely to have leaked" />
          </div>
          {!health.weak.length && !health.reused.length && !health.old.length && (
            <div className="card">
              <Empty icon={<KeyRound size={22} />} title="No password problems found" />
            </div>
          )}
        </>
      )}
    </>
  );
}
