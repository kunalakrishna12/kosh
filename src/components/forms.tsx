import { ArrowDownLeft, ArrowUpRight, Briefcase, Copy, Dices, Eye, EyeOff, Gauge, Paperclip, RefreshCw, Trash2, User, Wand2 } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { today } from '../lib/dates';
import { toInput, toMinor } from '../lib/money';
import { DEFAULT_GEN, generatePassword, strength, type GenOptions } from '../lib/passwords';
import { activeAccounts, defaultAccountId, masked } from '../lib/accounts';
import { advance } from '../lib/bills';
import { DEFAULT_MARKUP, fetchRate, foreignFmt, FOREIGN_CURRENCIES, fxToBase, impliedRate, lastKnownRate, parseMarkup, parseRate, type FxDraft } from '../lib/fx';
import { entryImpact } from '../lib/budgets';
import { taxPart } from '../lib/reports';
import { useNav, type TxDefaults } from '../nav';
import {
  BILL_KIND_LABEL,
  DEFAULT_CATEGORIES,
  FREQUENCY_LABEL,
  PROJECT_COLORS,
  TAX_RATES,
  type Bill,
  type BillFrequency,
  type BillKind,
  TO_COMPANY,
  TO_PERSONAL,
  TRANSFER_LABEL,
  type Book,
  type Project,
  type ProjectStatus,
  type Secret,
  type Transaction,
  type Transfer,
  type TransferReason,
  type TxKind,
} from '../lib/types';
import { useVault } from '../store';
import { Field, Modal, Seg, useCopy, useToast } from './ui';

const uid = () => crypto.randomUUID();

function AmountInput({ value, onChange, symbol }: { value: string; onChange: (v: string) => void; symbol: string }) {
  return (
    <div className="amount-wrap">
      {symbol && <span className="cur">{symbol}</span>}
      <input
        style={symbol ? undefined : { paddingLeft: 16 }}
        className="input amount-input"
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        aria-label="Amount"
        autoFocus
      />
    </div>
  );
}

function DeleteButton({ onDelete, what }: { onDelete: () => void; what: string }) {
  const [sure, setSure] = useState(false);
  return (
    <button type="button" className={`btn danger ${sure ? 'solid' : 'ghost'}`} onClick={() => (sure ? onDelete() : setSure(true))}>
      <Trash2 size={15} />
      {sure ? `Delete ${what}?` : 'Delete'}
    </button>
  );
}

export const BookLabel = ({ book }: { book: Book }) => (
  <>
    {book === 'personal' ? <User size={14} /> : <Briefcase size={14} />}
    {book === 'personal' ? 'Personal' : 'Company'}
  </>
);


/* ───────── Foreign currency ───────── */

export function CurrencySelect({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { data } = useVault();
  const base = data.settings.currency;
  return (
    <select className="select cur-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Currency">
      <option value={base}>{base}</option>
      {FOREIGN_CURRENCIES.filter((c) => c !== base).map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

/** Rate and card fee for a foreign amount, with the result in your currency. */
export function FxRateFields({ currency, foreignMinor, draft, setDraft, resultLabel }: { currency: string; foreignMinor: number | null; draft: FxDraft; setDraft: (d: FxDraft) => void; resultLabel: string }) {
  const { data, money } = useVault();
  const base = data.settings.currency;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const rate = parseRate(draft.rate);
  const markup = parseMarkup(draft.markup);
  const getRate = async () => {
    setBusy(true);
    setMsg('');
    try {
      setDraft({ ...draft, rate: String(Math.round((await fetchRate(currency, base)) * 10_000) / 10_000) });
    } catch {
      setMsg("Couldn't reach the rate service. Type the rate instead, e.g. from your bank app.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fx-box full">
      <div className="form-grid">
        <Field label={`Rate (${money.symbol} per 1 ${currency})`}>
          <div className="input-wrap">
            <input className="input num" inputMode="decimal" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value.replace(/[^\d.]/g, '') })} placeholder="84.12" />
            <div className="addons">
              <button type="button" className="btn sm" onClick={getRate} disabled={busy} title="Fetch today's reference rate (sends only the two currency codes)">
                {busy ? '…' : "Today's rate"}
              </button>
            </div>
          </div>
        </Field>
        <Field label="Card forex fee %" hint="Most cards: 3.5% + 18% GST = 4.13%. Use 0 for zero-markup cards (Niyo, Scapia…).">
          <input className="input num" inputMode="decimal" value={draft.markup} onChange={(e) => setDraft({ ...draft, markup: e.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
      </div>
      {msg && <div className="error-text" style={{ marginTop: 8 }}>{msg}</div>}
      {foreignMinor && rate && markup !== null ? (
        <div className="fx-sum">
          {foreignFmt(currency, foreignMinor)} × {money.symbol}
          {rate} {markup ? `+ ${markup}% fee` : ''} = <b className="num">{money.full(fxToBase({ amount: foreignMinor, rate, markup }))}</b> {resultLabel}
        </div>
      ) : (
        <div className="fx-sum faint">Enter the amount and rate to see what it costs in {base}.</div>
      )}
    </div>
  );
}

/* ───────── Transaction ───────── */

export function TxForm({
  initial,
  defaults,
  onClose,
}: {
  initial?: Transaction;
  defaults?: TxDefaults;
  onClose: () => void;
}) {
  const { data, update, money } = useVault();
  const toast = useToast();
  const [book, setBook] = useState<Book>(initial?.book ?? defaults?.book ?? 'personal');
  const [kind, setKind] = useState<TxKind>(initial?.kind ?? defaults?.kind ?? 'expense');
  const base = data.settings.currency;
  const startFx = initial?.fx ?? defaults?.fx;
  // `amount` is in `currency`; for a foreign currency, the cost in yours comes from rate + fee, or what the statement says.
  const [currency, setCurrency] = useState(startFx?.currency ?? base);
  const [amount, setAmount] = useState(startFx ? toInput(startFx.amount) : initial ? toInput(initial.amount) : defaults?.amount ? toInput(defaults.amount) : '');
  const [fxDraft, setFxDraft] = useState<FxDraft>({ rate: startFx ? String(startFx.rate) : String(lastKnownRate(data, 'USD') ?? ''), markup: String(startFx?.markup ?? DEFAULT_MARKUP) });
  const [charged, setCharged] = useState(initial?.fx ? toInput(initial.amount) : '');
  const foreign = currency !== base;
  const foreignMinor = foreign ? toMinor(amount) : null;
  const fxRate = parseRate(fxDraft.rate);
  const fxMarkup = parseMarkup(fxDraft.markup);
  const estimate = foreignMinor && fxRate && fxMarkup !== null ? fxToBase({ amount: foreignMinor, rate: fxRate, markup: fxMarkup }) : null;
  /** The entry's amount in your currency. */
  const baseAmount = foreign ? (charged.trim() ? toMinor(charged) : estimate) : toMinor(amount);
  const [category, setCategory] = useState(initial?.category ?? defaults?.category ?? '');
  const [date, setDate] = useState(initial?.date ?? today());
  const [note, setNote] = useState(initial?.note ?? defaults?.note ?? '');
  const [taxRate, setTaxRate] = useState(initial?.taxRate ?? defaults?.taxRate ?? 0);
  const nav = useNav();

  // Live budget check for expenses: warns before the entry is saved, never blocks a real record.
  const budgetNote = useMemo(() => {
    const minor = baseAmount;
    if (kind !== 'expense' || !minor) return null;
    const imp = entryImpact(data, { book, category: category.trim() || 'Other', amount: minor, date }, initial);
    const lines: { level: 'ok' | 'near' | 'over'; text: string }[] = [];
    const check = (label: string, spent: number, limit: number) => {
      const level = spent > limit ? 'over' : spent >= limit * 0.9 ? 'near' : 'ok';
      lines.push({
        level,
        text:
          level === 'over'
            ? `${label} goes over by ${money.full(spent - limit)} (${money.full(spent)} of ${money.full(limit)}).`
            : `${label}: ${money.full(limit - spent)} left after this (${Math.round((spent / limit) * 100)}% used).`,
      });
    };
    if (imp.category) check(`${imp.category.name} budget`, imp.category.spent, imp.category.limit);
    if (imp.overall) check(`${book === 'company' ? 'Company' : 'Your'} monthly budget`, imp.overall.spent, imp.overall.limit);
    if (!lines.length) return null;
    const rank = { ok: 0, near: 1, over: 2 };
    const level = lines.reduce((a, l) => (rank[l.level] > rank[a] ? l.level : a), 'ok' as 'ok' | 'near' | 'over');
    return { level, text: lines.map((l) => l.text).join(' ') };
  }, [data, kind, baseAmount, book, category, date, initial, money]);
  const attachments = initial ? data.docs.filter((d) => d.linkId === initial.id) : [];
  const billId = initial?.billId ?? defaults?.billId;
  const bill = billId ? data.bills.find((b) => b.id === billId) : undefined;
  const [projectId, setProjectId] = useState(initial?.projectId ?? defaults?.projectId ?? '');
  const [paidPersonally, setPaidPersonally] = useState(initial?.paidPersonally ?? false);
  // undefined = "use the default account for this book"; '' = explicitly no account.
  const [accountChoice, setAccountChoice] = useState<string | undefined>(initial ? initial.accountId ?? '' : defaults?.accountId);
  const accountBook: Book = book === 'company' && kind === 'expense' && paidPersonally ? 'personal' : book;
  const bookAccounts = activeAccounts(data, accountBook).map((a) => a.id);
  const accountId = accountChoice !== undefined && (accountChoice === '' || bookAccounts.includes(accountChoice)) ? accountChoice : defaultAccountId(data, accountBook) ?? '';
  const [error, setError] = useState('');

  const categories = useMemo(() => {
    const used = data.transactions.filter((t) => t.book === book && t.kind === kind).map((t) => t.category);
    return [...new Set([...DEFAULT_CATEGORIES[book][kind], ...used])];
  }, [data.transactions, book, kind]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const minor = baseAmount;
    if (foreign && (!foreignMinor || !fxRate || fxMarkup === null)) return setError(`Enter the ${currency} amount and the exchange rate.`);
    if (!minor) return setError('Enter an amount greater than zero.');
    const txFx = foreign ? { currency, amount: foreignMinor!, rate: fxRate!, markup: fxMarkup! } : undefined;
    const tx: Transaction = {
      id: initial?.id ?? uid(),
      createdAt: initial?.createdAt ?? Date.now(),
      book,
      kind,
      amount: minor,
      category: category.trim() || 'Other',
      date,
      note: note.trim(),
      ...(book === 'company' && projectId ? { projectId } : {}),
      ...(book === 'company' && kind === 'expense' && paidPersonally ? { paidPersonally: true } : {}),
      ...(billId ? { billId } : {}),
      ...(taxRate ? { taxRate } : {}),
      ...(accountId ? { accountId } : {}),
      ...(initial?.adjustment ? { adjustment: true } : {}),
      ...(txFx ? { fx: txFx } : {}),
    };
    update((d) => ({
      ...d,
      transactions: initial ? d.transactions.map((t) => (t.id === tx.id ? tx : t)) : [tx, ...d.transactions],
      // Paying a bill moves it on to its next due date, and remembers the latest amount.
      bills:
        !initial && billId
          ? d.bills.map((b) => {
              if (b.id !== billId) return b;
              const next = { ...b, nextDue: advance(b.nextDue, b.frequency), amount: b.variable ? minor : b.amount };
              // A foreign bill learns the real rate from what was charged, so next month's estimate is closer.
              if (b.fx && txFx) {
                const fx = { ...b.fx, rate: impliedRate(minor, txFx), markup: txFx.markup, amount: b.variable ? txFx.amount : b.fx.amount };
                return { ...next, fx, amount: fxToBase(fx) };
              }
              return next;
            })
          : d.bills,
    }));
    toast(initial ? 'Entry updated' : bill ? `${bill.name} marked paid` : `${kind === 'income' ? 'Income' : 'Expense'} added`);
    onClose();
  };

  const remove = () => {
    update((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== initial!.id) }));
    toast('Entry deleted');
    onClose();
  };

  const activeProjects = data.projects.filter((p) => p.status !== 'done' || p.id === projectId);

  return (
    <Modal
      title={initial ? 'Edit entry' : bill ? `Pay ${bill.name}` : 'New entry'}
      onClose={onClose}
      footer={
        <>
          {initial && <DeleteButton onDelete={remove} what="entry" />}
          <div className="right">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className={`btn primary ${budgetNote?.level === 'over' ? 'danger solid' : ''}`} form="tx-form">
              {budgetNote?.level === 'over' ? (initial ? 'Save anyway' : 'Add anyway') : initial ? 'Save' : 'Add'}
            </button>
          </div>
        </>
      }
    >
      <form id="tx-form" className="stack" onSubmit={submit}>
        <div className="row between wrap">
          <Seg
            label="Book"
            value={book}
            onChange={setBook}
            options={[
              { value: 'personal', label: <BookLabel book="personal" /> },
              { value: 'company', label: <BookLabel book="company" /> },
            ]}
          />
          <Seg
            label="Kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'expense', label: <><ArrowUpRight size={14} /> Expense</> },
              { value: 'income', label: <><ArrowDownLeft size={14} /> Income</> },
            ]}
          />
        </div>
        <div className="amount-row">
          <AmountInput value={amount} onChange={(v) => (setAmount(v), setError(''))} symbol={foreign ? '' : money.symbol} />
          <CurrencySelect
            value={currency}
            onChange={(c) => {
              setCurrency(c);
              if (c !== base && !fxDraft.rate) setFxDraft({ ...fxDraft, rate: String(lastKnownRate(data, c) ?? '') });
            }}
          />
        </div>
        {foreign && (
          <>
            <FxRateFields currency={currency} foreignMinor={foreignMinor} draft={fxDraft} setDraft={setFxDraft} resultLabel="estimated" />
            <Field label={`Charged in ${base}`} hint="From your card or bank statement, if you have it. Kosh uses this as the real cost.">
              <input className="input num" inputMode="decimal" value={charged} onChange={(e) => (setCharged(e.target.value.replace(/[^\d.,]/g, '')), setError(''))} placeholder={estimate ? toInput(estimate) : '0'} />
            </Field>
          </>
        )}
        {error && <div className="error-text">{error}</div>}
        {budgetNote && (
          <div className={`budget-note ${budgetNote.level}`} role="status">
            <Gauge size={15} />
            <span>{budgetNote.text}</span>
          </div>
        )}
        <div className="form-grid">
          <Field label="Category">
            <input className="input" list="tx-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={categories[0]} />
            <datalist id="tx-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} required />
          </Field>
          <AccountSelect book={accountBook} value={accountId} onChange={setAccountChoice} label={kind === 'income' ? 'Received into' : accountBook !== book ? 'Paid from (your account)' : 'Paid from'} />
          <Field label="Note" className={bookAccounts.length ? undefined : 'full'}>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'expense' ? 'What was it for?' : 'Who paid you?'} />
          </Field>
          {book === 'company' && (
            <Field
              label={kind === 'income' ? 'GST / VAT charged (included)' : 'GST / VAT paid (included)'}
              hint={taxRate && toMinor(amount) ? `${money.full(taxPart(toMinor(amount)!, taxRate))} of this is tax` : 'Used for the tax summary in Reports.'}
            >
              <select className="select" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}>
                {TAX_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r ? `${r}%` : 'No tax'}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {book === 'company' && (
            <Field label="Project">
              <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">No project</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.client ? ` · ${p.client}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {initial && (
            <div className="full row wrap" style={{ gap: 8 }}>
              {attachments.map((d) => (
                <button key={d.id} type="button" className="pill gold" style={{ border: 0, cursor: 'pointer' }} onClick={() => nav.go('documents')}>
                  <Paperclip size={11} /> {d.name}
                </button>
              ))}
              <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
                <Paperclip size={14} /> Attach receipt
                <input
                  type="file"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) nav.open({ type: 'upload', files: [f], defaults: { folder: 'receipts', book, linkId: initial.id } });
                  }}
                />
              </label>
            </div>
          )}
          {book === 'company' && kind === 'expense' && (
            <label className="check full">
              <input type="checkbox" checked={paidPersonally} onChange={(e) => setPaidPersonally(e.target.checked)} />
              <span>
                I paid this with my own money
                <br />
                <small className="faint">It comes out of your personal cash, and the company owes it back to you.</small>
              </span>
            </label>
          )}
        </div>
      </form>
    </Modal>
  );
}

/* ───────── Transfer (you ↔ company) ───────── */

export function TransferForm({ initial, onClose }: { initial?: Transfer; onClose: () => void }) {
  const { data, update, money } = useVault();
  const toast = useToast();
  const [dir, setDir] = useState<'in' | 'out'>(initial ? (TO_COMPANY.includes(initial.reason) ? 'in' : 'out') : 'out');
  const [reason, setReason] = useState<TransferReason>(initial?.reason ?? 'salary');
  const [amount, setAmount] = useState(initial ? toInput(initial.amount) : '');
  const [date, setDate] = useState(initial?.date ?? today());
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState('');
  const company = data.settings.companyName || 'Company';
  const [fromChoice, setFromChoice] = useState<string | undefined>(initial ? initial.fromAccountId ?? '' : undefined);
  const [toChoice, setToChoice] = useState<string | undefined>(initial ? initial.toAccountId ?? '' : undefined);
  const fromBook: Book = dir === 'in' ? 'personal' : 'company';
  const toBook: Book = dir === 'in' ? 'company' : 'personal';
  const pick = (choice: string | undefined, b: Book) =>
    choice !== undefined && (choice === '' || activeAccounts(data, b).some((a) => a.id === choice)) ? choice : defaultAccountId(data, b) ?? '';
  const fromAccountId = pick(fromChoice, fromBook);
  const toAccountId = pick(toChoice, toBook);

  const reasons = dir === 'in' ? TO_COMPANY : TO_PERSONAL;
  const pickDir = (d: 'in' | 'out') => {
    setDir(d);
    setReason(d === 'in' ? 'capital' : 'salary');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const minor = toMinor(amount);
    if (!minor) return setError('Enter an amount greater than zero.');
    const t: Transfer = {
      id: initial?.id ?? uid(),
      createdAt: initial?.createdAt ?? Date.now(),
      reason,
      amount: minor,
      date,
      note: note.trim(),
      ...(fromAccountId ? { fromAccountId } : {}),
      ...(toAccountId ? { toAccountId } : {}),
    };
    update((d) => ({ ...d, transfers: initial ? d.transfers.map((x) => (x.id === t.id ? t : x)) : [t, ...d.transfers] }));
    toast(initial ? 'Transfer updated' : 'Transfer recorded');
    onClose();
  };

  const help: Record<TransferReason, string> = {
    capital: 'Equity you put into the business. Not paid back.',
    loan: 'Money the company must pay back to you.',
    salary: 'Counts as your personal income and a company expense.',
    dividend: 'A share of profit. Personal income, not a company expense.',
    repayment: 'The company paying back a loan you gave it.',
    reimbursement: 'Paying you back for company bills you covered.',
  };

  return (
    <Modal
      title={initial ? 'Edit transfer' : 'Move money'}
      onClose={onClose}
      footer={
        <>
          {initial && (
            <DeleteButton
              what="transfer"
              onDelete={() => {
                update((d) => ({ ...d, transfers: d.transfers.filter((x) => x.id !== initial.id) }));
                toast('Transfer deleted');
                onClose();
              }}
            />
          )}
          <div className="right">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" form="tr-form">
              {initial ? 'Save' : 'Record'}
            </button>
          </div>
        </>
      }
    >
      <form id="tr-form" className="stack" onSubmit={submit}>
        <Seg
          label="Direction"
          value={dir}
          onChange={pickDir}
          options={[
            { value: 'out', label: <>{company} → You</> },
            { value: 'in', label: <>You → {company}</> },
          ]}
        />
        <AmountInput value={amount} onChange={(v) => (setAmount(v), setError(''))} symbol={money.symbol} />
        {error && <div className="error-text">{error}</div>}
        <div className="form-grid">
          <Field label="Type" hint={help[reason]} className="full">
            <select className="select" value={reason} onChange={(e) => setReason(e.target.value as TransferReason)}>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {TRANSFER_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
          </Field>
          <Field label="Note">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>
          <AccountSelect book={fromBook} value={fromAccountId} onChange={setFromChoice} label="From account" />
          <AccountSelect book={toBook} value={toAccountId} onChange={setToChoice} label="To account" />
        </div>
      </form>
    </Modal>
  );
}

/** Account picker used by entry, transfer, invoice and import forms. Renders nothing until you have accounts. */
export function AccountSelect({ book, value, onChange, label = 'Account', allowNone = true }: { book: Book; value: string; onChange: (id: string) => void; label?: string; allowNone?: boolean }) {
  const { data } = useVault();
  const list = activeAccounts(data, book);
  if (!list.length) return null;
  return (
    <Field label={label}>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {allowNone && <option value="">No account</option>}
        {list.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.number ? ` · ${masked(a.number)}` : ''}
          </option>
        ))}
      </select>
    </Field>
  );
}

/* ───────── Project ───────── */

export function ProjectForm({ initial, onClose }: { initial?: Project; onClose: () => void }) {
  const { data, update, money } = useVault();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [client, setClient] = useState(initial?.client ?? '');
  const [contract, setContract] = useState(initial ? toInput(initial.contract) : '');
  const [budget, setBudget] = useState(initial ? toInput(initial.budget) : '');
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? 'active');
  const [color, setColor] = useState(initial?.color ?? PROJECT_COLORS[data.projects.length % PROJECT_COLORS.length]);
  const [startDate, setStartDate] = useState(initial?.startDate ?? today());
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the project a name.');
    const p: Project = {
      id: initial?.id ?? uid(),
      createdAt: initial?.createdAt ?? Date.now(),
      name: name.trim(),
      client: client.trim(),
      contract: toMinor(contract) ?? 0,
      budget: toMinor(budget) ?? 0,
      status,
      color,
      startDate,
    };
    update((d) => ({ ...d, projects: initial ? d.projects.map((x) => (x.id === p.id ? p : x)) : [p, ...d.projects] }));
    toast(initial ? 'Project updated' : 'Project created');
    onClose();
  };

  const remove = () => {
    update((d) => ({
      ...d,
      projects: d.projects.filter((x) => x.id !== initial!.id),
      transactions: d.transactions.map((t) => (t.projectId === initial!.id ? { ...t, projectId: undefined } : t)),
    }));
    toast('Project deleted · its entries were kept');
    onClose();
  };

  return (
    <Modal
      title={initial ? 'Edit project' : 'New project'}
      onClose={onClose}
      footer={
        <>
          {initial && <DeleteButton onDelete={remove} what="project" />}
          <div className="right">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" form="pr-form">
              {initial ? 'Save' : 'Create'}
            </button>
          </div>
        </>
      }
    >
      <form id="pr-form" className="form-grid" onSubmit={submit}>
        <Field label="Project name" className="full">
          <input className="input" value={name} onChange={(e) => (setName(e.target.value), setError(''))} placeholder="Website rebuild" autoFocus />
        </Field>
        <Field label="Client">
          <input className="input" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Acme Corp" />
        </Field>
        <Field label="Start date">
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value || today())} />
        </Field>
        <Field label={`Contract value (${money.symbol})`} hint="What the client pays you in total.">
          <input className="input num" inputMode="decimal" value={contract} onChange={(e) => setContract(e.target.value)} placeholder="0" />
        </Field>
        <Field label={`Delivery budget (${money.symbol})`} hint="What you plan to spend doing it.">
          <input className="input num" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Status">
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="done">Done</option>
          </select>
        </Field>
        <div className="field">
          <span>Colour</span>
          <div className="row" style={{ height: 40 }}>
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  border: 0,
                  background: c,
                  boxShadow: c === color ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : 'none',
                }}
              />
            ))}
          </div>
        </div>
        {error && <div className="error-text full">{error}</div>}
      </form>
    </Modal>
  );
}

/* ───────── Password strength meter ───────── */

const STRENGTH_COLORS = ['var(--expense)', 'var(--expense)', 'var(--warn)', 'var(--income)', 'var(--income)'];

export function StrengthMeter({ password }: { password: string }) {
  const s = strength(password);
  const filled = password ? Math.max(1, s.score) : 0;
  return (
    <div>
      <div className="meter" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <i key={i} style={{ background: i < filled ? STRENGTH_COLORS[s.score] : undefined }} />
        ))}
      </div>
      {password && (
        <div className="row between" style={{ fontSize: 12, marginTop: 6 }}>
          <span style={{ color: STRENGTH_COLORS[s.score], fontWeight: 600 }}>{s.label}</span>
          <span className="faint">{s.hint}</span>
        </div>
      )}
    </div>
  );
}

/* ───────── Generator ───────── */

export function ColoredPassword({ value }: { value: string }) {
  return (
    <>
      {[...value].map((ch, i) => (
        <span key={i} className={/\d/.test(ch) ? 'pw-char-d' : /[^a-zA-Z0-9]/.test(ch) ? 'pw-char-s' : undefined}>
          {ch}
        </span>
      ))}
    </>
  );
}

export function GeneratorPanel({ onUse }: { onUse?: (pw: string) => void }) {
  const copy = useCopy();
  const [o, setO] = useState<GenOptions>(DEFAULT_GEN);
  const [pw, setPw] = useState(() => generatePassword(DEFAULT_GEN));
  const set = (patch: Partial<GenOptions>) => {
    const next = { ...o, ...patch };
    setO(next);
    setPw(generatePassword(next));
  };
  return (
    <div className="stack">
      <div className="gen-out">
        <span>
          <ColoredPassword value={pw} />
        </span>
        <button type="button" className="icon-btn" onClick={() => setPw(generatePassword(o))} aria-label="Generate another">
          <RefreshCw size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={() => copy(pw, 'Password', true)} aria-label="Copy">
          <Copy size={16} />
        </button>
      </div>
      <StrengthMeter password={pw} />
      <Field label={`Length · ${o.length}`}>
        <input className="range" type="range" min={8} max={64} value={o.length} onChange={(e) => set({ length: Number(e.target.value) })} />
      </Field>
      <div className="grid g-2" style={{ gap: 10 }}>
        {(
          [
            ['upper', 'A–Z uppercase'],
            ['lower', 'a–z lowercase'],
            ['digits', '0–9 digits'],
            ['symbols', '!@# symbols'],
            ['avoidAmbiguous', 'Avoid look-alikes (l, I, O, 0)'],
          ] as [keyof GenOptions, string][]
        ).map(([k, label]) => (
          <label key={k} className="check">
            <input type="checkbox" checked={o[k] as boolean} onChange={(e) => set({ [k]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>
      {onUse && (
        <button type="button" className="btn primary" onClick={() => onUse(pw)}>
          <Wand2 size={15} /> Use this password
        </button>
      )}
    </div>
  );
}

export function GeneratorModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Password generator" onClose={onClose}>
      <GeneratorPanel />
    </Modal>
  );
}

/* ───────── Secret ───────── */

export function SecretForm({ initial, defaults, onClose }: { initial?: Secret; defaults?: { book?: Book }; onClose: () => void }) {
  const { update } = useVault();
  const toast = useToast();
  const [book, setBook] = useState<Book>(initial?.book ?? defaults?.book ?? 'personal');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [username, setUsername] = useState(initial?.username ?? '');
  const [password, setPassword] = useState(initial?.password ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [show, setShow] = useState(!initial);
  const [gen, setGen] = useState(false);
  const [error, setError] = useState('');
  const pwRef = useRef<HTMLInputElement>(null);
  // Browser password managers can fill this field without an input event; trust the field.
  const readPw = () => {
    const v = pwRef.current?.value ?? password;
    if (v !== password) setPassword(v);
    return v;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('Give it a name, like "GitHub".');
    const password = readPw();
    const now = Date.now();
    const changed = !initial || initial.password !== password;
    const s: Secret = {
      id: initial?.id ?? uid(),
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      book,
      title: title.trim(),
      username: username.trim(),
      password,
      url: url.trim(),
      notes,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      favorite: initial?.favorite ?? false,
      passwordChangedAt: changed ? now : initial!.passwordChangedAt,
      history:
        initial && changed && initial.password
          ? [{ password: initial.password, changedAt: initial.passwordChangedAt }, ...initial.history].slice(0, 10)
          : initial?.history ?? [],
    };
    update((d) => ({ ...d, secrets: initial ? d.secrets.map((x) => (x.id === s.id ? s : x)) : [s, ...d.secrets] }));
    toast(initial ? 'Login updated' : 'Login saved');
    onClose();
  };

  return (
    <Modal
      title={initial ? 'Edit login' : 'New login'}
      onClose={onClose}
      footer={
        <>
          {initial && (
            <DeleteButton
              what="login"
              onDelete={() => {
                update((d) => ({ ...d, secrets: d.secrets.filter((x) => x.id !== initial.id) }));
                toast('Login deleted');
                onClose();
              }}
            />
          )}
          <div className="right">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" form="sec-form">
              {initial ? 'Save' : 'Save login'}
            </button>
          </div>
        </>
      }
    >
      <form id="sec-form" className="form-grid" onSubmit={submit} autoComplete="off">
        <div className="full">
          <Seg
            label="Belongs to"
            value={book}
            onChange={setBook}
            options={[
              { value: 'personal', label: <BookLabel book="personal" /> },
              { value: 'company', label: <BookLabel book="company" /> },
            ]}
          />
        </div>
        <Field label="Name">
          <input className="input" value={title} onChange={(e) => (setTitle(e.target.value), setError(''))} placeholder="GitHub" autoFocus />
        </Field>
        <Field label="Website">
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com" />
        </Field>
        <Field label="Username or email" className="full">
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        </Field>
        <div className="field full">
          <span>Password</span>
          <div className="input-wrap">
            <input
              ref={pwRef}
              className="input mono"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={readPw}
              autoComplete="new-password"
              spellCheck={false}
            />
            <div className="addons">
              <button
                type="button"
                className="icon-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  readPw();
                  setShow((v) => !v);
                }}
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button type="button" className="icon-btn" onClick={() => setGen(!gen)} aria-label="Generate password">
                <Dices size={16} />
              </button>
            </div>
          </div>
          <StrengthMeter password={password} />
        </div>
        {gen && (
          <div className="full card" style={{ background: 'var(--bg-2)' }}>
            <GeneratorPanel
              onUse={(pw) => {
                setPassword(pw);
                setShow(true);
                setGen(false);
              }}
            />
          </div>
        )}
        <Field label="Tags" hint="Separate with commas." className="full">
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="bank, admin" />
        </Field>
        <Field label="Notes" className="full">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Recovery codes, security questions…" />
        </Field>
        {error && <div className="error-text full">{error}</div>}
      </form>
    </Modal>
  );
}

/* ───────── Bill ───────── */

const KIND_CATEGORY: Record<BillKind, Record<Book, string>> = {
  cloud: { company: 'Cloud', personal: 'Subscriptions' },
  api: { company: 'APIs', personal: 'Subscriptions' },
  saas: { company: 'Software', personal: 'Subscriptions' },
  rent: { company: 'Rent', personal: 'Rent' },
  utility: { company: 'Utilities', personal: 'Utilities' },
  payroll: { company: 'Payroll', personal: 'Other' },
  tax: { company: 'Legal & Tax', personal: 'Other' },
  insurance: { company: 'Insurance', personal: 'Insurance' },
  loan: { company: 'Other', personal: 'Loan EMI' },
  other: { company: 'Other', personal: 'Other' },
};

export function BillForm({ initial, defaults, onClose }: { initial?: Bill; defaults?: { book?: Book }; onClose: () => void }) {
  const { data, update } = useVault();
  const toast = useToast();
  const [book, setBook] = useState<Book>(initial?.book ?? defaults?.book ?? 'company');
  const [name, setName] = useState(initial?.name ?? '');
  const [vendor, setVendor] = useState(initial?.vendor ?? '');
  const [kind, setKind] = useState<BillKind>(initial?.kind ?? 'saas');
  const base = data.settings.currency;
  const [currency, setCurrency] = useState(initial?.fx?.currency ?? base);
  const [amount, setAmount] = useState(initial ? toInput(initial.fx ? initial.fx.amount : initial.amount) : '');
  const [fxDraft, setFxDraft] = useState<FxDraft>({ rate: String(initial?.fx?.rate ?? lastKnownRate(data, initial?.fx?.currency ?? 'USD') ?? ''), markup: String(initial?.fx?.markup ?? DEFAULT_MARKUP) });
  const foreign = currency !== base;
  const [variable, setVariable] = useState(initial?.variable ?? false);
  const [frequency, setFrequency] = useState<BillFrequency>(initial?.frequency ?? 'monthly');
  const [nextDue, setNextDue] = useState(initial?.nextDue ?? today());
  const [category, setCategory] = useState(initial?.category ?? '');
  const [projectId, setProjectId] = useState(initial?.projectId ?? '');
  const [taxRate, setTaxRate] = useState(initial?.taxRate ?? 0);
  const [autopay, setAutopay] = useState(initial?.autopay ?? false);
  const [paidFrom, setPaidFrom] = useState(initial?.accountId ?? '');
  // A bill's card or account belongs to the same book as the bill.
  const paidFromId = activeAccounts(data, book).some((a) => a.id === paidFrom) ? paidFrom : '';
  const [active, setActive] = useState(initial?.active ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the bill a name, like "AWS".');
    const entered = toMinor(amount);
    if (!entered) return setError(variable ? 'Enter a rough estimate. You can change it each time you pay.' : 'Enter the amount.');
    const rate = parseRate(fxDraft.rate);
    const markup = parseMarkup(fxDraft.markup);
    if (foreign && (!rate || markup === null)) return setError(`Enter the ${currency} rate, or press "Today's rate".`);
    const fx = foreign ? { currency, amount: entered, rate: rate!, markup: markup! } : undefined;
    // The bill's amount is always kept in your currency, so budgets, forecasts and reminders just work.
    const minor = fx ? fxToBase(fx) : entered;
    const b: Bill = {
      id: initial?.id ?? uid(),
      createdAt: initial?.createdAt ?? Date.now(),
      book,
      name: name.trim(),
      vendor: vendor.trim(),
      kind,
      amount: minor,
      variable,
      frequency,
      nextDue,
      category: category.trim() || KIND_CATEGORY[kind][book],
      ...(book === 'company' && projectId ? { projectId } : {}),
      ...(taxRate ? { taxRate } : {}),
      ...(fx ? { fx } : {}),
      ...(paidFromId ? { accountId: paidFromId } : {}),
      autopay,
      active,
      notes,
    };
    update((d) => ({ ...d, bills: initial ? d.bills.map((x) => (x.id === b.id ? b : x)) : [b, ...d.bills] }));
    toast(initial ? 'Bill updated' : 'Bill added');
    onClose();
  };

  return (
    <Modal
      title={initial ? 'Edit bill' : 'New recurring bill'}
      onClose={onClose}
      footer={
        <>
          {initial && (
            <DeleteButton
              what="bill"
              onDelete={() => {
                update((d) => ({
                  ...d,
                  bills: d.bills.filter((x) => x.id !== initial.id),
                  transactions: d.transactions.map((t) => (t.billId === initial.id ? { ...t, billId: undefined } : t)),
                }));
                toast('Bill deleted · past payments were kept');
                onClose();
              }}
            />
          )}
          <div className="right">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" form="bill-form">
              {initial ? 'Save' : 'Add bill'}
            </button>
          </div>
        </>
      }
    >
      <form id="bill-form" className="form-grid" onSubmit={submit}>
        <div className="full">
          <Seg
            label="Paid by"
            value={book}
            onChange={setBook}
            options={[
              { value: 'company', label: <BookLabel book="company" /> },
              { value: 'personal', label: <BookLabel book="personal" /> },
            ]}
          />
        </div>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => (setName(e.target.value), setError(''))} placeholder="AWS, OpenAI API, Office rent…" autoFocus />
        </Field>
        <Field label="Vendor">
          <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Who you pay" />
        </Field>
        <Field label="Type">
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as BillKind)}>
            {(Object.keys(BILL_KIND_LABEL) as BillKind[]).map((k) => (
              <option key={k} value={k}>
                {BILL_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Repeats">
          <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value as BillFrequency)}>
            {(Object.keys(FREQUENCY_LABEL) as BillFrequency[]).map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={variable ? 'Estimated amount' : 'Amount'}>
          <div className="input-wrap">
            <input className="input num" inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setError(''))} placeholder="0" />
            <CurrencySelect
              value={currency}
              onChange={(c) => {
                setCurrency(c);
                if (c !== base && !fxDraft.rate) setFxDraft({ ...fxDraft, rate: String(lastKnownRate(data, c) ?? '') });
              }}
            />
          </div>
        </Field>
        <Field label="Next due">
          <input className="input" type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value || today())} />
        </Field>
        {foreign && (
          <FxRateFields currency={currency} foreignMinor={toMinor(amount)} draft={fxDraft} setDraft={setFxDraft} resultLabel={`a ${frequency === 'yearly' ? 'year' : frequency === 'quarterly' ? 'quarter' : frequency === 'weekly' ? 'week' : 'month'}, estimated`} />
        )}
        <label className="check full">
          <input type="checkbox" checked={variable} onChange={(e) => setVariable(e.target.checked)} />
          <span>
            Usage-based amount
            <br />
            <small className="faint">For cloud and API bills that change every month. You enter the real amount when you pay, and Kosh flags big jumps.</small>
          </span>
        </label>
        <Field label="Category">
          <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={KIND_CATEGORY[kind][book]} />
        </Field>
        {book === 'company' ? (
          <Field label="GST / VAT included">
            <select className="select" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}>
              {TAX_RATES.map((r) => (
                <option key={r} value={r}>
                  {r ? `${r}%` : 'No tax'}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div />
        )}
        <AccountSelect
          book={book}
          value={paidFromId}
          onChange={(id) => {
            setPaidFrom(id);
            // Bills on a card are usually auto-charged.
            if (data.accounts.find((a) => a.id === id)?.kind === 'card') setAutopay(true);
          }}
          label="Paid from (card or account)"
        />
        {book === 'company' && data.projects.length > 0 && (
          <Field label="Charge to project" className="full">
            <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {data.projects
                .filter((p) => p.status !== 'done' || p.id === projectId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <label className="check">
          <input type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} />
          Paid automatically (card / mandate)
        </label>
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
        <Field label="Notes" className="full">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Account ID, card used, cancellation link…" />
        </Field>
        {error && <div className="error-text full">{error}</div>}
      </form>
    </Modal>
  );
}
