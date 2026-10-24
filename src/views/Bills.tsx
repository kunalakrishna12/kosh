import { CalendarClock, Check, Pencil, Receipt, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY_COLORS, Donut } from '../components/charts';
import { Empty, Seg } from '../components/ui';
import { foreignFmt } from '../lib/fx';
import { billState, billSummary, monthlyCost, occurrences, paymentsOf, priceChange } from '../lib/bills';
import { addDays, dayLabel, parseDate, today } from '../lib/dates';
import { BILL_KIND_LABEL, FREQUENCY_LABEL, type Bill, type BillKind, type Book } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';

function dueText(date: string, t: string) {
  const days = Math.round((parseDate(date).getTime() - parseDate(t).getTime()) / 86_400_000);
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 7) return `Due in ${days} days`;
  return dayLabel(date);
}

export function usePayBill() {
  const nav = useNav();
  return (b: Bill) =>
    nav.open({
      type: 'tx',
      defaults: { book: b.book, kind: 'expense', amount: b.amount, category: b.category, note: b.name, billId: b.id, projectId: b.projectId, taxRate: b.taxRate, fx: b.fx, accountId: b.accountId },
    });
}

export function Bills() {
  const { data, money } = useVault();
  const nav = useNav();
  const pay = usePayBill();
  const accountName = (id?: string) => (id ? data.accounts.find((a) => a.id === id)?.name : undefined);
  const [book, setBook] = useState<Book | 'all'>('all');
  const t = today();

  const summary = useMemo(() => billSummary(data, t), [data, t]);
  const upcoming = useMemo(() => occurrences(data.bills, t, addDays(t, 30)).filter((o) => book === 'all' || o.bill.book === book), [data.bills, t, book]);
  // Only the first upcoming occurrence of each bill can be paid now.
  const payable = new Set(data.bills.map((b) => `${b.id}:${b.nextDue}`));

  const list = data.bills
    .filter((b) => book === 'all' || b.book === book)
    .sort((a, b) => Number(b.active) - Number(a.active) || (a.nextDue < b.nextDue ? -1 : 1));

  const byKind = useMemo(() => {
    const m = new Map<BillKind, number>();
    for (const b of data.bills) if (b.active && (book === 'all' || b.book === book)) m.set(b.kind, (m.get(b.kind) ?? 0) + monthlyCost(b));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data.bills, book]);
  const kindTotal = byKind.reduce((s, [, v]) => s + v, 0);

  const changes = useMemo(
    () =>
      data.bills
        .map((b) => ({ b, change: priceChange(data, b.id) }))
        .filter((x): x is { b: Bill; change: number } => x.change !== null && Math.abs(x.change) >= 0.08 && (book === 'all' || x.b.book === book))
        .sort((a, b) => b.change - a.change)
        .slice(0, 5),
    [data, book],
  );

  if (!data.bills.length) {
    return (
      <div className="card">
        <Empty
          icon={<Receipt size={22} />}
          title="Never miss a bill again"
          action={
            <button className="btn primary" onClick={() => nav.open({ type: 'bill' })}>
              Add your first bill
            </button>
          }
        >
          Add cloud, API, software, rent, utilities, insurance or CA fees once. Kosh reminds you when they're due, records each payment, flags price
          jumps on usage-based bills, and plans them into your cash forecast.
        </Empty>
      </div>
    );
  }

  const overdueTotal = summary.overdue.reduce((s, b) => s + b.amount, 0);

  return (
    <>
      <div className="grid g-4">
        <div className="card">
          <div className="stat-l">Company bills a month</div>
          <div className="stat-v num">{money.compact(summary.monthly.company)}</div>
          <div className="stat-d">{money.compact(summary.monthly.company * 12)} a year</div>
        </div>
        <div className="card">
          <div className="stat-l">Personal bills a month</div>
          <div className="stat-v num">{money.compact(summary.monthly.personal)}</div>
          <div className="stat-d">{money.compact(summary.monthly.personal * 12)} a year</div>
        </div>
        <div className="card">
          <div className="stat-l">Due in the next 30 days</div>
          <div className="stat-v num">{money.compact(summary.dueNext30)}</div>
          <div className="stat-d">{summary.soon.length} due this week</div>
        </div>
        <div className="card" style={{ borderColor: summary.overdue.length ? 'color-mix(in srgb, var(--expense) 40%, transparent)' : undefined }}>
          <div className="stat-l">Overdue</div>
          <div className={`stat-v num ${summary.overdue.length ? 'down' : ''}`}>{summary.overdue.length ? money.compact(overdueTotal) : 'None'}</div>
          <div className="stat-d">{summary.overdue.length ? `${summary.overdue.length} bill${summary.overdue.length > 1 ? 's' : ''} waiting` : 'All caught up'}</div>
        </div>
      </div>

      <div className="row between mt-lg" style={{ marginBottom: 14 }}>
        <Seg
          label="Book"
          value={book}
          onChange={setBook}
          options={[
            { value: 'all', label: 'All bills' },
            { value: 'company', label: 'Company' },
            { value: 'personal', label: 'Personal' },
          ]}
        />
      </div>

      <div className="grid g-main">
        <div className="card flush">
          <div className="card-h" style={{ padding: '18px 20px 0' }}>
            <div>
              <h2>Coming up</h2>
              <div className="sub">Overdue and the next 30 days</div>
            </div>
          </div>
          {upcoming.length === 0 && <p className="muted" style={{ padding: '0 20px 20px' }}>Nothing due in the next 30 days.</p>}
          {upcoming.map((o) => {
            const state = billState({ ...o.bill, nextDue: o.date }, t);
            const canPay = payable.has(`${o.bill.id}:${o.date}`);
            return (
              <div key={`${o.bill.id}:${o.date}`} className="tx" style={{ gridTemplateColumns: '36px minmax(0,1fr) auto auto', cursor: 'default' }}>
                <div className={`tx-ico ${o.bill.book}`}>{state === 'overdue' ? <CalendarClock size={16} /> : <Receipt size={16} />}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="tx-t">{o.bill.name}</div>
                  <div className="tx-s">
                    <span className={state === 'overdue' ? 'down' : state === 'soon' ? '' : 'faint'} style={{ fontWeight: state === 'later' ? 400 : 600, color: state === 'soon' ? 'var(--warn)' : undefined }}>
                      {dueText(o.date, t)}
                    </span>
                    {accountName(o.bill.accountId) && <> · {accountName(o.bill.accountId)}</>}
                    {o.bill.autopay && (
                      <>
                        · <Zap size={12} /> autopay
                      </>
                    )}
                  </div>
                </div>
                <div className="tx-a num">
                  {o.bill.fx ? (
                    <>
                      {foreignFmt(o.bill.fx.currency, o.bill.fx.amount)}
                      <div className="faint" style={{ fontSize: 11.5, fontWeight: 400 }}>
                        ≈ {money.full(o.bill.amount)}
                      </div>
                    </>
                  ) : (
                    <>
                      {o.bill.variable ? '~' : ''}
                      {money.full(o.bill.amount)}
                    </>
                  )}
                </div>
                <div>
                  {canPay ? (
                    <button className={`btn sm ${state === 'overdue' ? 'primary' : ''}`} onClick={() => pay(o.bill)}>
                      <Check size={14} /> Pay
                    </button>
                  ) : (
                    <span className="faint" style={{ fontSize: 12, padding: '0 10px' }}>
                      later
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-h">
              <div>
                <h2>Monthly cost by type</h2>
                <div className="sub">{money.full(kindTotal)} a month</div>
              </div>
            </div>
            <div className="donut-wrap" style={{ gridTemplateColumns: '130px 1fr' }}>
              <Donut size={130} thickness={16} slices={byKind.map(([k, v], i) => ({ value: v, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length], label: BILL_KIND_LABEL[k] }))} />
              <div>
                {byKind.map(([k, v], i) => (
                  <div key={k} className="cat-row" style={{ gridTemplateColumns: '10px 1fr auto' }}>
                    <i className="swatch" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                    <span>{BILL_KIND_LABEL[k]}</span>
                    <span className="num">{money.compact(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-h">
              <div>
                <h2>Price changes</h2>
                <div className="sub">Last payment vs the one before</div>
              </div>
            </div>
            {changes.length === 0 && <p className="muted" style={{ margin: 0 }}>No big changes.</p>}
            {changes.map(({ b, change }) => (
              <div key={b.id} className="cat-row" style={{ gridTemplateColumns: '18px 1fr auto' }}>
                {change > 0 ? <TrendingUp size={15} className="down" /> : <TrendingDown size={15} className="up" />}
                <span>{b.name}</span>
                <b className={`num ${change > 0 ? 'down' : 'up'}`}>
                  {change > 0 ? '+' : ''}
                  {Math.round(change * 100)}%
                </b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card flush mt">
        <div className="card-h" style={{ padding: '18px 20px 0' }}>
          <h2>All bills</h2>
          <span className="sub">{list.filter((b) => b.active).length} active</span>
        </div>
        {list.map((b) => {
          const state = billState(b, t);
          const last = paymentsOf(data, b.id)[0];
          return (
            <div key={b.id} className="tx" style={{ gridTemplateColumns: '36px minmax(0,1.4fr) minmax(0,1fr) auto auto', opacity: b.active ? 1 : 0.5 }} onClick={() => nav.open({ type: 'bill', initial: b })}>
              <div className={`tx-ico ${b.book}`}>
                <Receipt size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="tx-t">{b.name}</div>
                <div className="tx-s">
                  {b.vendor || BILL_KIND_LABEL[b.kind]} · {FREQUENCY_LABEL[b.frequency]}
                  {accountName(b.accountId) && ` · ${accountName(b.accountId)}`}
                  {b.variable && ' · usage-based'}
                </div>
              </div>
              <div className="tx-meta" style={{ flexDirection: 'column', gap: 2, fontSize: 12.5 }}>
                <span className={state === 'overdue' ? 'down' : 'muted'} style={{ fontWeight: state === 'overdue' ? 600 : 400 }}>
                  {b.active ? dueText(b.nextDue, t) : 'Paused'}
                </span>
                <span className="faint">{last ? `last paid ${money.compact(last.amount)} · ${dayLabel(last.date)}` : 'not paid yet'}</span>
              </div>
              <div className="tx-a num">
                {b.fx ? foreignFmt(b.fx.currency, b.fx.amount) : `${b.variable ? '~' : ''}${money.full(b.amount)}`}
                <div className="faint" style={{ fontSize: 11.5, fontWeight: 400 }}>
                  {b.fx ? `≈ ${money.full(b.amount)} · ` : ''}
                  {money.compact(monthlyCost(b))}/mo
                </div>
              </div>
              <div className="row" style={{ gap: 2 }} onClick={(e) => e.stopPropagation()}>
                {b.active && (
                  <button className="icon-btn" onClick={() => pay(b)} aria-label={`Mark ${b.name} paid`} title="Mark paid">
                    <Check size={16} />
                  </button>
                )}
                <button className="icon-btn" onClick={() => nav.open({ type: 'bill', initial: b })} aria-label="Edit bill" title="Edit">
                  <Pencil size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
