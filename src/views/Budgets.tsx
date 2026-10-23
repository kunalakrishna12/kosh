import { Gauge, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { BookLabel } from '../components/forms';
import { Bar, Empty, Field, Modal, Seg, useToast } from '../components/ui';
import { budgetStatus, suggestBudgets, type BudgetStatus } from '../lib/budgets';
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
  const [book, setBook] = useState<Book | 'all'>('all');
  const isCurrent = month === today().slice(0, 7);

  const statuses = useMemo(() => budgetStatus(data, month).filter((s) => book === 'all' || s.budget.book === book), [data, month, book]);
  const suggestions = useMemo(
    () => (book === 'all' ? (['company', 'personal'] as Book[]) : [book]).flatMap((b) => suggestBudgets(data, b).slice(0, 5).map((s) => ({ ...s, book: b }))),
    [data, book],
  );

  const limit = statuses.reduce((s, x) => s + x.budget.amount, 0);
  const spent = statuses.reduce((s, x) => s + x.spent, 0);
  const over = statuses.filter((s) => s.state === 'over').length;
  const atRisk = statuses.filter((s) => s.state === 'pace' || s.state === 'near').length;

  const addSuggested = (items: { book: Book; category: string; amount: number }[]) => {
    update((d) => ({ ...d, budgets: [...d.budgets, ...items.map((s) => ({ id: crypto.randomUUID(), book: s.book, category: s.category, amount: s.amount, createdAt: Date.now() }))] }));
    toast(items.length === 1 ? `Budget set for ${items[0].category}` : `${items.length} budgets added`);
  };

  const Suggestions = () =>
    suggestions.length ? (
      <div className="card">
        <div className="card-h">
          <div>
            <h2>
              <Sparkles size={14} style={{ verticalAlign: -2, color: 'var(--gold)' }} /> Suggested from your spending
            </h2>
            <div className="sub">Your average over the last three months, rounded up</div>
          </div>
          <button className="btn sm" onClick={() => addSuggested(suggestions)}>
            Add all
          </button>
        </div>
        {suggestions.map((s) => (
          <div key={`${s.book}:${s.category}`} className="cat-row" style={{ gridTemplateColumns: '10px 1fr auto auto' }}>
            <i className="swatch" style={{ background: s.book === 'company' ? 'var(--company)' : 'var(--personal)' }} />
            <span>{s.category}</span>
            <span className="num">{money.compact(s.amount)}/mo</span>
            <button className="btn ghost sm" onClick={() => addSuggested([s])}>
              Add
            </button>
          </div>
        ))}
      </div>
    ) : null;

  if (!data.budgets.length) {
    return (
      <div className="stack" style={{ gap: 16 }}>
        <div className="card">
          <Empty
            icon={<Gauge size={22} />}
            title="Set limits, and know before you go over"
            action={
              <button className="btn primary" onClick={() => nav.open({ type: 'budget' })}>
                <Plus size={15} /> New budget
              </button>
            }
          >
            Give any category a monthly limit, personal or company. Kosh tracks it live, projects where you'll land by month end, and warns you early.
          </Empty>
        </div>
        <Suggestions />
      </div>
    );
  }

  return (
    <>
      <div className="row between wrap" style={{ marginBottom: 16 }}>
        <Seg
          label="Book"
          value={book}
          onChange={setBook}
          options={[
            { value: 'all', label: 'All' },
            { value: 'company', label: 'Company' },
            { value: 'personal', label: 'Personal' },
          ]}
        />
        <select className="select" style={{ width: 'auto', height: 36 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
          {lastMonths(6)
            .reverse()
            .map((m) => (
              <option key={m} value={m}>
                {monthLabel(m, true)}
                {m === today().slice(0, 7) ? ' (this month)' : ''}
              </option>
            ))}
        </select>
      </div>

      <div className="grid g-4">
        <div className="card">
          <div className="stat-l">Budgeted</div>
          <div className="stat-v num">{money.compact(limit)}</div>
          <div className="stat-d">{statuses.length} categories</div>
        </div>
        <div className="card">
          <div className="stat-l">Spent {isCurrent ? 'so far' : ''}</div>
          <div className="stat-v num">{money.compact(spent)}</div>
          <Bar value={limit ? spent / limit : 0} color={spent > limit ? 'var(--expense)' : 'var(--gold)'} />
        </div>
        <div className="card">
          <div className="stat-l">Left to spend</div>
          <div className={`stat-v num ${limit - spent < 0 ? 'down' : ''}`}>{money.compact(limit - spent)}</div>
          <div className="stat-d">{limit ? `${Math.round((spent / limit) * 100)}% used` : ''}</div>
        </div>
        <div className="card" style={{ borderColor: over ? 'color-mix(in srgb, var(--expense) 40%, transparent)' : undefined }}>
          <div className="stat-l">Needs attention</div>
          <div className={`stat-v num ${over ? 'down' : ''}`}>{over + atRisk || 'None'}</div>
          <div className="stat-d">
            {over} over · {atRisk} {isCurrent ? 'on pace to go over' : 'close to the limit'}
          </div>
        </div>
      </div>

      <div className="grid g-main mt">
        <div className="card flush">
          {statuses
            .sort((a, b) => b.used - a.used)
            .map((s) => (
              <div key={s.budget.id} className="budget-row" role="button" tabIndex={0} onClick={() => nav.open({ type: 'budget', initial: s.budget })} onKeyDown={(e) => e.key === 'Enter' && nav.open({ type: 'budget', initial: s.budget })}>
                <div className="row between">
                  <span className="row" style={{ gap: 8, fontWeight: 600 }}>
                    <i className="swatch" style={{ background: s.budget.book === 'company' ? 'var(--company)' : 'var(--personal)' }} />
                    {s.budget.category}
                    {s.state === 'over' && <span className="pill bad">Over by {money.compact(s.spent - s.budget.amount)}</span>}
                    {s.state === 'pace' && isCurrent && <span className="pill warn">On pace for {money.compact(s.projected)}</span>}
                    {s.state === 'near' && <span className="pill warn">{Math.round(s.used * 100)}% used</span>}
                  </span>
                  <span className="num" style={{ fontSize: 13 }}>
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
                      : `${money.compact(s.perDayLeft)} a day left · month end ≈ ${money.compact(s.projected)}`
                    : `${Math.round(s.used * 100)}% of budget`}
                </div>
              </div>
            ))}
          {statuses.length === 0 && <Empty icon={<Gauge size={22} />} title="No budgets in this book" />}
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <Suggestions />
          <div className="card">
            <div className="card-h">
              <h2>How it works</h2>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              The marker on each bar shows where you'll land at today's pace. Kosh warns you in Insights when a category is on track to go over, so you can
              slow down with weeks to spare.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export function BudgetForm({ initial, onClose }: { initial?: Budget; onClose: () => void }) {
  const { data, update, money } = useVault();
  const toast = useToast();
  const [book, setBook] = useState<Book>(initial?.book ?? 'personal');
  const [category, setCategory] = useState(initial?.category ?? '');
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
