import { CalendarClock, Gauge, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { AreaChart, Bars } from '../components/charts';
import { BookLabel } from '../components/forms';
import { Bar, Empty, Field, Modal, Seg, useToast } from '../components/ui';
import { budgetHistory, budgetStatus, dailyBurn, overallStatus, suggestBudgets, suggestOverall, unbudgeted, type BudgetStatus, type OverallStatus } from '../lib/budgets';
import { lastMonths, monthLabel, today } from '../lib/dates';
import { toInput, toMinor } from '../lib/money';
import { DEFAULT_CATEGORIES, type Book, type Budget } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';

const STATE_COLOR: Record<BudgetStatus['state'], string> = {
  ok: 'var(--income)',
  pace: 'var(--warn)',
  near: 'var(--warn)',
  over: 'var(--expense)',
};

export function Budgets() {
  const { data, update, money } = useVault();
  const nav = useNav();
  const toast = useToast();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [book, setBook] = useState<Book>('personal');
  const [editingOverall, setEditingOverall] = useState(false);
  const isCurrent = month === today().slice(0, 7);
  const company = data.settings.companyName || 'Company';

  const overall = useMemo(() => overallStatus(data, book, month), [data, book, month]);
  const statuses = useMemo(() => budgetStatus(data, month).filter((s) => s.budget.book === book), [data, month, book]);
  const loose = useMemo(() => unbudgeted(data, book, month), [data, book, month]);
  const burn = useMemo(() => dailyBurn(data, book, month), [data, book, month]);
  const history = useMemo(() => budgetHistory(data, book, 6), [data, book]);
  const suggestions = useMemo(() => suggestBudgets(data, book).slice(0, 5), [data, book]);
  const hasOverall = overall.limit > 0;
  const allocated = statuses.reduce((s, x) => s + x.budget.amount, 0);
  const pastMonths = history.filter((h) => h.month < today().slice(0, 7) && h.limit);
  const within = pastMonths.filter((h) => h.spent <= h.limit).length;

  const addSuggested = (items: { category: string; amount: number }[]) => {
    update((d) => ({ ...d, budgets: [...d.budgets, ...items.map((s) => ({ id: crypto.randomUUID(), book, category: s.category, amount: s.amount, createdAt: Date.now() }))] }));
    toast(items.length === 1 ? `Budget set for ${items[0].category}` : `${items.length} budgets added`);
  };

  return (
    <>
      <div className="row between wrap" style={{ marginBottom: 16 }}>
        <Seg
          label="Book"
          value={book}
          onChange={setBook}
          options={[
            { value: 'personal', label: <BookLabel book="personal" /> },
            { value: 'company', label: <BookLabel book="company" /> },
          ]}
        />
        <select className="select" style={{ width: 'auto', height: 36 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
          {lastMonths(12)
            .reverse()
            .map((m) => (
              <option key={m} value={m}>
                {monthLabel(m, true)}
                {m === today().slice(0, 7) ? ' (this month)' : ''}
              </option>
            ))}
        </select>
      </div>

      {hasOverall ? (
        <OverallCard o={overall} isCurrent={isCurrent} title={`${book === 'company' ? company : 'Your'} budget for ${monthLabel(month, true)}`} onEdit={() => setEditingOverall(true)} />
      ) : (
        <div className="card budget-hero empty-hero">
          <div>
            <div className="stat-l">
              <Gauge size={14} /> {book === 'company' ? company : 'Your'} monthly budget
            </div>
            <h2 style={{ margin: '6px 0 4px', fontSize: 20, letterSpacing: '-0.02em' }}>Set one limit for everything you spend in a month</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              Kosh counts every expense against it, including bills still to come, tells you what's safe to spend each day, and warns you before an entry
              takes you over.
              {suggestOverall(data, book) > 0 && <> Your last three months averaged about {money.full(suggestOverall(data, book))}.</>}
            </p>
          </div>
          <button className="btn primary" onClick={() => setEditingOverall(true)}>
            <Plus size={15} /> Set monthly budget
          </button>
        </div>
      )}

      <div className="grid g-main mt">
        <div className="card">
          <div className="card-h">
            <div>
              <h2>Spending through the month</h2>
              <div className="sub">{hasOverall ? 'Your running total against an even pace to the budget' : 'Your running total'}</div>
            </div>
            {hasOverall && isCurrent && (
              <span className={`pill ${overall.projected > overall.limit ? 'bad' : 'good'}`}>
                Month end ≈ {money.compact(overall.projected)}
              </span>
            )}
          </div>
          <AreaChart
            labels={burn.map((d) => String(d.day))}
            tipTitle={(i) => `${burn[i].day} ${monthLabel(month)}`}
            series={[
              { name: 'Spent so far', color: overall.state === 'over' ? 'var(--expense)' : 'var(--gold)', values: burn.map((d) => d.spent) },
              ...(hasOverall ? [{ name: 'Even pace', color: 'var(--text-3)', values: burn.map((d) => d.pace), dashed: true }] : []),
            ]}
            format={money.full}
            height={220}
          />
        </div>
        <div className="card">
          <div className="card-h">
            <div>
              <h2>Last 6 months</h2>
              <div className="sub">{hasOverall && pastMonths.length ? `Within budget ${within} of ${pastMonths.length} months` : 'Total spending each month'}</div>
            </div>
          </div>
          <Bars
            labels={history.map((h) => monthLabel(h.month))}
            series={[
              { name: 'Spent', color: 'var(--gold)', values: history.map((h) => h.spent) },
              ...(hasOverall ? [{ name: 'Budget', color: 'var(--surface-3)', values: history.map((h) => h.limit) }] : []),
            ]}
            format={money.full}
            height={220}
          />
        </div>
      </div>

      <div className="row between mt-lg" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="section-title" style={{ fontSize: 17, margin: 0 }}>
            Category budgets
          </h2>
          {hasOverall && statuses.length > 0 && (
            <div className="faint" style={{ fontSize: 12.5 }}>
              {money.full(allocated)} of {money.full(overall.limit)} given to categories
              {allocated > overall.limit ? ' · more than your monthly budget' : ` · ${money.full(overall.limit - allocated)} left for everything else`}
            </div>
          )}
        </div>
        <button className="btn ghost sm" onClick={() => nav.open({ type: 'budget', defaults: { book } })}>
          <Plus size={14} /> Category budget
        </button>
      </div>

      <div className="grid g-main">
        <div className="card flush">
          {statuses.length === 0 && (
            <Empty icon={<Gauge size={22} />} title="No category budgets yet">
              Optional. Give the categories you overspend on their own limit, like Dining or Shopping.
            </Empty>
          )}
          {[...statuses]
            .sort((a, b) => b.used - a.used)
            .map((s) => (
              <div key={s.budget.id} className="budget-row" role="button" tabIndex={0} onClick={() => nav.open({ type: 'budget', initial: s.budget })} onKeyDown={(e) => e.key === 'Enter' && nav.open({ type: 'budget', initial: s.budget })}>
                <div className="row between">
                  <span className="row" style={{ gap: 8, fontWeight: 600, minWidth: 0 }}>
                    {s.budget.category}
                    {s.state === 'over' && <span className="pill bad">Over by {money.compact(s.spent - s.budget.amount)}</span>}
                    {s.state === 'pace' && isCurrent && <span className="pill warn">On pace for {money.compact(s.projected)}</span>}
                    {s.state === 'near' && <span className="pill warn">{Math.round(s.used * 100)}% used</span>}
                  </span>
                  <span className="num" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                    <b>{money.compact(s.spent)}</b> <span className="faint">/ {money.compact(s.budget.amount)}</span>
                  </span>
                </div>
                <div className="budget-bar">
                  <Bar value={s.used} color={STATE_COLOR[s.state]} />
                  {isCurrent && s.projected > s.spent && (
                    <i className="budget-proj" style={{ left: `${Math.min(100, (s.projected / s.budget.amount) * 100)}%` }} title={`Projected ${money.full(s.projected)}`} />
                  )}
                </div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {isCurrent
                    ? s.state === 'over'
                      ? 'Limit reached for this month'
                      : `${money.compact(s.budget.amount - s.spent)} left · ${money.compact(s.perDayLeft)} a day · month end ≈ ${money.compact(s.projected)}`
                    : `${Math.round(s.used * 100)}% of budget`}
                </div>
              </div>
            ))}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          {loose.length > 0 && (
            <div className="card">
              <div className="card-h">
                <div>
                  <h2>Spending without a category budget</h2>
                  <div className="sub">
                    {money.full(loose.reduce((s, x) => s + x.amount, 0))} in {monthLabel(month)}
                    {hasOverall ? ', counted in your monthly budget' : ''}
                  </div>
                </div>
              </div>
              {loose.slice(0, 6).map((l) => (
                <div key={l.category} className="cat-row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                  <span>{l.category}</span>
                  <span className="num">{money.compact(l.amount)}</span>
                  <button className="btn ghost sm" onClick={() => nav.open({ type: 'budget', defaults: { book, category: l.category } })}>
                    Set limit
                  </button>
                </div>
              ))}
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="card">
              <div className="card-h">
                <div>
                  <h2>
                    <Sparkles size={14} style={{ verticalAlign: -2, color: 'var(--gold)' }} /> Suggested from your spending
                  </h2>
                  <div className="sub">Average of the last three months, rounded up</div>
                </div>
                <button className="btn sm" onClick={() => addSuggested(suggestions)}>
                  Add all
                </button>
              </div>
              {suggestions.map((s) => (
                <div key={s.category} className="cat-row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                  <span>{s.category}</span>
                  <span className="num">{money.compact(s.amount)}/mo</span>
                  <button className="btn ghost sm" onClick={() => addSuggested([s])}>
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editingOverall && <OverallForm book={book} onClose={() => setEditingOverall(false)} />}
    </>
  );
}

const OVERALL_COPY: Record<OverallStatus['state'], string> = {
  ok: 'On track',
  pace: 'On pace to go over',
  near: 'Close to the limit',
  over: 'Over budget',
};

export function OverallCard({ o, isCurrent, title, onEdit, compact }: { o: OverallStatus; isCurrent: boolean; title: string; onEdit?: () => void; compact?: boolean }) {
  const { money } = useVault();
  const color = STATE_COLOR[o.state];
  const spentPct = Math.min(100, o.used * 100);
  const committedPct = Math.max(0, Math.min(100 - spentPct, (o.committed / (o.limit || 1)) * 100));
  return (
    <div className={`card budget-hero ${compact ? 'compact' : ''}`}>
      <div className="row between wrap" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="stat-l">
            <Gauge size={14} /> {title}
          </div>
          <div className="row" style={{ alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <span className="stat-v num" style={{ fontSize: compact ? 24 : 32, marginTop: 0 }}>
              {money.full(o.spent)}
            </span>
            <span className="faint num">of {money.full(o.limit)}</span>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className={`pill ${o.state === 'ok' ? 'good' : o.state === 'over' ? 'bad' : 'warn'}`}>{OVERALL_COPY[o.state]}</span>
          {onEdit && (
            <button className="icon-btn" onClick={onEdit} aria-label="Edit monthly budget">
              <Pencil size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="hero-bar" aria-label={`${Math.round(o.used * 100)}% of budget spent`}>
        <i style={{ width: `${spentPct}%`, background: color }} />
        {isCurrent && committedPct > 0 && <i className="committed" style={{ width: `${committedPct}%` }} title="Bills still due this month" />}
      </div>
      {isCurrent ? (
        <div className="hero-facts">
          <div>
            <span>Safe to spend</span>
            <b className={`num ${o.safeToSpend < 0 ? 'down' : ''}`}>{money.full(o.safeToSpend)}</b>
          </div>
          <div>
            <span>Per day, {o.daysLeft} days left</span>
            <b className="num">{money.full(o.perDayLeft)}</b>
          </div>
          {!compact && (
            <div>
              <span>
                <CalendarClock size={12} /> Bills still due
              </span>
              <b className="num">{money.full(o.committed)}</b>
            </div>
          )}
          {!compact && (
            <div>
              <span>Month end at this pace</span>
              <b className={`num ${o.projected > o.limit ? 'down' : ''}`}>{money.full(o.projected)}</b>
            </div>
          )}
        </div>
      ) : (
        <div className="faint" style={{ fontSize: 13, marginTop: 10 }}>
          {o.spent > o.limit ? `Went over by ${money.full(o.spent - o.limit)}` : `Stayed within budget, ${money.full(o.limit - o.spent)} to spare`}
        </div>
      )}
    </div>
  );
}

function OverallForm({ book, onClose }: { book: Book; onClose: () => void }) {
  const { data, update, money } = useVault();
  const toast = useToast();
  const current = data.settings.monthlyBudget[book];
  const suggested = suggestOverall(data, book);
  const [amount, setAmount] = useState(current ? toInput(current) : suggested ? toInput(suggested) : '');
  const [error, setError] = useState('');
  const save = (value: number) => {
    update((d) => ({ ...d, settings: { ...d.settings, monthlyBudget: { ...d.settings.monthlyBudget, [book]: value } } }));
    toast(value ? `Monthly budget set to ${money.full(value)}` : 'Monthly budget removed');
    onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const minor = toMinor(amount);
    if (!minor) return setError('Enter your monthly limit.');
    save(minor);
  };
  return (
    <Modal
      title={`${book === 'company' ? data.settings.companyName || 'Company' : 'Your'} monthly budget`}
      onClose={onClose}
      footer={
        <>
          {current > 0 && (
            <button className="btn ghost danger" onClick={() => save(0)}>
              <Trash2 size={15} /> Remove
            </button>
          )}
          <div className="right">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" form="overall-form">
              Save
            </button>
          </div>
        </>
      }
    >
      <form id="overall-form" className="stack" onSubmit={submit}>
        <div className="amount-wrap">
          <span className="cur">{money.symbol}</span>
          <input className="input amount-input" inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value.replace(/[^\d.,]/g, '')), setError(''))} autoFocus aria-label="Monthly budget" />
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          The most you want to spend in a month, across every category, bills included. SIPs and moves between your accounts don't count, because they're
          savings.
          {suggested > 0 && <> Your last three months averaged about {money.full(suggested)}.</>}
        </p>
        {error && <div className="error-text">{error}</div>}
      </form>
    </Modal>
  );
}

export function BudgetForm({ initial, defaults, onClose }: { initial?: Budget; defaults?: { book?: Book; category?: string }; onClose: () => void }) {
  const { data, update, money } = useVault();
  const toast = useToast();
  const [book, setBook] = useState<Book>(initial?.book ?? defaults?.book ?? 'personal');
  const [category, setCategory] = useState(initial?.category ?? defaults?.category ?? '');
  const [amount, setAmount] = useState(initial ? toInput(initial.amount) : '');
  const [error, setError] = useState('');

  const categories = useMemo(
    () => [...new Set([...DEFAULT_CATEGORIES[book].expense, ...data.transactions.filter((t) => t.book === book && t.kind === 'expense').map((t) => t.category)])],
    [data.transactions, book],
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const minor = toMinor(amount);
    if (!category.trim()) return setError('Pick a category.');
    if (!minor) return setError('Enter a monthly limit.');
    if (data.budgets.some((b) => b.book === book && b.category === category.trim() && b.id !== initial?.id)) return setError(`${category} already has a budget.`);
    const b: Budget = { id: initial?.id ?? crypto.randomUUID(), createdAt: initial?.createdAt ?? Date.now(), book, category: category.trim(), amount: minor };
    update((d) => ({ ...d, budgets: initial ? d.budgets.map((x) => (x.id === b.id ? b : x)) : [...d.budgets, b] }));
    toast(initial ? 'Budget updated' : `Budget set for ${b.category}`);
    onClose();
  };

  return (
    <Modal
      title={initial ? `${initial.category} budget` : 'New budget'}
      onClose={onClose}
      footer={
        <>
          {initial && (
            <button
              className="btn ghost danger"
              onClick={() => {
                update((d) => ({ ...d, budgets: d.budgets.filter((x) => x.id !== initial.id) }));
                toast('Budget removed');
                onClose();
              }}
            >
              <Trash2 size={15} /> Remove
            </button>
          )}
          <div className="right">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" form="budget-form">
              Save
            </button>
          </div>
        </>
      }
    >
      <form id="budget-form" className="stack" onSubmit={submit}>
        <Seg
          label="Book"
          value={book}
          onChange={setBook}
          options={[
            { value: 'personal', label: <BookLabel book="personal" /> },
            { value: 'company', label: <BookLabel book="company" /> },
          ]}
        />
        <div className="form-grid">
          <Field label="Category">
            <input className="input" list="budget-cats" value={category} onChange={(e) => (setCategory(e.target.value), setError(''))} autoFocus />
            <datalist id="budget-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label={`Monthly limit (${money.symbol})`}>
            <input className="input num" inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setError(''))} placeholder="0" />
          </Field>
        </div>
        {error && <div className="error-text">{error}</div>}
      </form>
    </Modal>
  );
}
