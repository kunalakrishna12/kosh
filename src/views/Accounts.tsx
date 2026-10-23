import { ArrowLeftRight, Banknote, Building2, Copy, CreditCard, Eye, EyeOff, Landmark, PiggyBank, Plus, Scale, Smartphone, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Sparkline } from '../components/charts';
import { BookLabel } from '../components/forms';
import { activityOf, ActivityRow } from '../components/rows';
import { Empty, Field, Modal, Seg, useCopy, useToast } from '../components/ui';
import { ACCOUNT_COLORS, activeAccounts, balanceHistory, masked } from '../lib/accounts';
import { accountBalances } from '../lib/analytics';
import { today } from '../lib/dates';
import { toBalance, toInput, toMinor } from '../lib/money';
import { ACCOUNT_KIND_LABEL, type Account, type AccountKind, type Book, type Move } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';

export const ACCOUNT_ICON: Record<AccountKind, typeof Landmark> = {
  savings: PiggyBank,
  current: Building2,
  cash: Banknote,
  card: CreditCard,
  wallet: Smartphone,
  deposit: Landmark,
};

export function Accounts() {
  const { data, money } = useVault();
  const nav = useNav();
  const [open, setOpen] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const bal = useMemo(() => accountBalances(data), [data]);

  const total = (book: Book) => activeAccounts(data, book).reduce((s, a) => s + (bal.byAccount.get(a.id) ?? 0), 0);
  const cashInHand = data.accounts.filter((a) => !a.archived && a.kind === 'cash').reduce((s, a) => s + (bal.byAccount.get(a.id) ?? 0), 0);
  const cardDue = data.accounts.filter((a) => !a.archived && a.kind === 'card').reduce((s, a) => s + Math.min(0, bal.byAccount.get(a.id) ?? 0), 0);
  const company = data.settings.companyName || 'Company';
  const openAccount = data.accounts.find((a) => a.id === open);

  if (!data.accounts.length) {
    return (
      <div className="card">
        <Empty
          icon={<Landmark size={22} />}
          title="Know exactly where your money is"
          action={
            <button className="btn primary" onClick={() => nav.open({ type: 'account' })}>
              <Plus size={15} /> Add an account
            </button>
          }
        >
          Add your bank accounts, cash in hand, cards and wallets, for you and the company. Kosh keeps each balance up to date from your entries, and
          your account details stay encrypted.
        </Empty>
      </div>
    );
  }

  return (
    <>
      <div className="grid g-4">
        <div className="card">
          <div className="stat-l">Personal, all accounts</div>
          <div className="stat-v num">{money.compact(total('personal'))}</div>
        </div>
        <div className="card">
          <div className="stat-l">{company}, all accounts</div>
          <div className="stat-v num">{money.compact(total('company'))}</div>
        </div>
        <div className="card">
          <div className="stat-l">
            <Banknote size={14} /> Cash in hand
          </div>
          <div className="stat-v num">{money.compact(cashInHand)}</div>
          <div className="stat-d">Count it now and then, and use “Update balance”.</div>
        </div>
        <div className="card">
          <div className="stat-l">
            <CreditCard size={14} /> Owed on cards
          </div>
          <div className={`stat-v num ${cardDue < 0 ? 'down' : ''}`}>{money.compact(-cardDue)}</div>
        </div>
      </div>

      <div className="row wrap mt" style={{ justifyContent: 'flex-end' }}>
        {data.accounts.some((a) => a.archived) && (
          <button className="btn ghost sm" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Hide closed accounts' : 'Show closed accounts'}
          </button>
        )}
        <button className="btn sm" onClick={() => nav.open({ type: 'move' })}>
          <ArrowLeftRight size={14} /> Move money between accounts
        </button>
      </div>

      <BookSection book="personal" byAccount={bal.byAccount} unassigned={bal.unassigned.personal} showArchived={showArchived} onOpen={setOpen} />
      <BookSection book="company" byAccount={bal.byAccount} unassigned={bal.unassigned.company} showArchived={showArchived} onOpen={setOpen} />

      {openAccount && <AccountDetail a={openAccount} balance={bal.byAccount.get(openAccount.id) ?? 0} onClose={() => setOpen(null)} />}
    </>
  );
}

function BookSection({
  book,
  byAccount,
  unassigned,
  showArchived,
  onOpen,
}: {
  book: Book;
  byAccount: Map<string, number>;
  unassigned: number;
  showArchived: boolean;
  onOpen: (id: string) => void;
}) {
  const { data, money } = useVault();
  const nav = useNav();
  const list = data.accounts.filter((a) => a.book === book && (showArchived || !a.archived));
  const total = activeAccounts(data, book).reduce((s, a) => s + (byAccount.get(a.id) ?? 0), 0);
  return (
    <>
      <div className="row between mt-lg" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ fontSize: 17, margin: 0 }}>
          <span className={`pill ${book}`} style={{ marginRight: 8 }}>
            <BookLabel book={book} />
          </span>
          {money.full(total)}
        </h2>
        <button className="btn ghost sm" onClick={() => nav.open({ type: 'account', defaults: { book } })}>
          <Plus size={14} /> Add
        </button>
      </div>
      <div className="grid g-3">
        {list.map((a) => (
          <AccountCard key={a.id} a={a} balance={byAccount.get(a.id) ?? 0} onOpen={() => onOpen(a.id)} />
        ))}
        {unassigned !== 0 && (
          <div className="card acct-card unassigned">
            <div className="stat-l">Not linked to an account</div>
            <div className="stat-v num" style={{ fontSize: 22 }}>
              {money.full(unassigned)}
            </div>
            <div className="stat-d">
              From entries with no account picked, or the opening balance in Settings. Edit entries to pick their account, and this goes to zero.
            </div>
          </div>
        )}
        {list.length === 0 && unassigned === 0 && (
          <button className="card acct-card" style={{ borderStyle: 'dashed', background: 'transparent', color: 'var(--text-3)' }} onClick={() => nav.open({ type: 'account', defaults: { book } })}>
            <Plus size={16} /> Add a {book === 'company' ? 'company' : 'personal'} account
          </button>
        )}
      </div>
    </>
  );
}

function AccountCard({ a, balance, onOpen }: { a: Account; balance: number; onOpen: () => void }) {
  const { data, money } = useVault();
  const Icon = ACCOUNT_ICON[a.kind];
  const history = useMemo(() => balanceHistory(data, a.id), [data, a.id]);
  return (
    <div className={`card acct-card ${a.archived ? 'archived' : ''}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="acct-stripe" style={{ background: a.color }} />
      <div className="row between">
        <div className="row" style={{ gap: 10, minWidth: 0 }}>
          <div className="acct-ico" style={{ background: `color-mix(in srgb, ${a.color} 16%, transparent)`, color: a.color }}>
            <Icon size={17} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="tx-t">{a.name}</div>
            <div className="tx-s">
              {a.bank || ACCOUNT_KIND_LABEL[a.kind]}
              {a.number && ` · ${masked(a.number)}`}
            </div>
          </div>
        </div>
        {a.archived && <span className="pill">Closed</span>}
      </div>
      <div className={`stat-v num ${balance < 0 ? 'down' : ''}`} style={{ fontSize: 24, marginTop: 14 }}>
        {money.full(balance)}
      </div>
      <div className="stat-d">{a.kind === 'card' ? (balance < 0 ? 'owed on the card' : 'in credit') : ACCOUNT_KIND_LABEL[a.kind]}</div>
      <div style={{ marginTop: 10 }}>
        <Sparkline values={history} color={a.color} height={30} />
      </div>
    </div>
  );
}

function AccountDetail({ a, balance, onClose }: { a: Account; balance: number; onClose: () => void }) {
  const { data, money } = useVault();
  const nav = useNav();
  const copy = useCopy();
  const [reveal, setReveal] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const Icon = ACCOUNT_ICON[a.kind];

  const rows = useMemo(
    () =>
      activityOf(
        data.transactions.filter((t) => t.accountId === a.id),
        data.transfers.filter((t) => t.fromAccountId === a.id || t.toAccountId === a.id),
        data.moves.filter((m) => m.from === a.id || m.to === a.id),
      ).slice(0, 40),
    [data, a.id],
  );

  const details: [string, string, boolean?][] = [
    ['Bank', a.bank],
    ['Branch', a.branch],
    ['Account holder', a.holder],
    ['Account number', a.number, true],
    ['IFSC', a.ifsc],
    ['UPI ID', a.upi],
  ];

  return (
    <Modal
      wide
      title={
        <span className="row">
          <Icon size={18} style={{ color: a.color }} />
          {a.name}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={() => (onClose(), nav.open({ type: 'account', initial: a }))}>
            Edit account
          </button>
          <div className="right">
            <button className="btn" onClick={() => nav.open({ type: 'move', defaults: { from: a.id } })}>
              <ArrowLeftRight size={15} /> Move money
            </button>
            <button className="btn primary" onClick={() => setAdjusting(true)}>
              <Scale size={15} /> Update balance
            </button>
          </div>
        </>
      }
    >
      <div className="grid g-2" style={{ gap: 16, alignItems: 'start' }}>
        <div>
          <div className="stat-l">Balance in Kosh</div>
          <div className={`stat-v num ${balance < 0 ? 'down' : ''}`} style={{ fontSize: 30 }}>
            {money.full(balance)}
          </div>
          <div className="stat-d">{ACCOUNT_KIND_LABEL[a.kind]}</div>
          {a.notes && <p className="muted" style={{ fontSize: 13 }}>{a.notes}</p>}
        </div>
        <div className="acct-details">
          {details
            .filter(([, v]) => v)
            .map(([label, value, secret]) => (
              <div key={label} className="row between">
                <span className="faint">{label}</span>
                <span className="row" style={{ gap: 4 }}>
                  <span className="mono">{secret && !reveal ? masked(value) : value}</span>
                  {secret && (
                    <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => setReveal(!reveal)} aria-label={reveal ? 'Hide account number' : 'Show account number'}>
                      {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  )}
                  <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => copy(value.replace(/\s/g, ''), label)} aria-label={`Copy ${label}`}>
                    <Copy size={13} />
                  </button>
                </span>
              </div>
            ))}
          {details.every(([, v]) => !v) && <span className="faint">No bank details saved.</span>}
        </div>
      </div>
      {adjusting && <UpdateBalance a={a} balance={balance} onDone={() => setAdjusting(false)} />}
      <div className="card flush mt" style={{ maxHeight: 300, overflowY: 'auto', boxShadow: 'none' }}>
        {rows.length ? (
          rows.map((r) => <ActivityRow key={r.kind === 'tx' ? r.tx.id : r.kind === 'transfer' ? r.tr.id : r.mv.id} a={r} />)
        ) : (
          <p className="muted" style={{ padding: 20, margin: 0 }}>
            No entries in this account yet. When you add an entry, pick this account.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** "My wallet actually has ₹3,200": records the difference as a balance correction. */
function UpdateBalance({ a, balance, onDone }: { a: Account; balance: number; onDone: () => void }) {
  const { update, money } = useVault();
  const toast = useToast();
  const [actual, setActual] = useState('');
  const target = actual.trim() === '' ? null : toBalance(actual);
  const diff = target === null ? 0 : target - balance;
  const save = () => {
    if (target === null || diff === 0) return onDone();
    update((d) => ({
      ...d,
      transactions: [
        {
          id: crypto.randomUUID(),
          book: a.book,
          kind: diff > 0 ? 'income' : 'expense',
          amount: Math.abs(diff),
          category: 'Balance adjustment',
          date: today(),
          note: `${a.name} balance updated to ${money.full(target)}`,
          accountId: a.id,
          adjustment: true,
          createdAt: Date.now(),
        },
        ...d.transactions,
      ],
    }));
    toast(`${a.name} set to ${money.full(target)}`);
    onDone();
  };
  return (
    <div className="card mt" style={{ background: 'var(--bg-2)' }}>
      <div className="form-grid">
        <Field label={`What ${a.kind === 'cash' ? 'you actually have in hand' : 'the bank shows'} today`} hint={a.kind === 'card' ? 'For a card, enter what you owe as a negative number, like -12000.' : undefined}>
          <input className="input num" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value.replace(/[^\d.,-]/g, ''))} placeholder={toInput(Math.abs(balance))} autoFocus />
        </Field>
        <div className="stack" style={{ alignContent: 'end', gap: 8 }}>
          {target !== null && diff !== 0 && (
            <span className="muted" style={{ fontSize: 13 }}>
              Records a {diff > 0 ? 'gain' : 'shortfall'} of <b className={diff > 0 ? 'up' : 'down'}>{money.full(Math.abs(diff))}</b>. It won't count as income or
              spending.
            </span>
          )}
          <div className="row">
            <button className="btn ghost sm" onClick={onDone}>
              Cancel
            </button>
            <button className="btn primary sm" onClick={save} disabled={target === null}>
              Save balance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Forms ───────── */

export function AccountForm({ initial, defaults, onClose }: { initial?: Account; defaults?: { book?: Book }; onClose: () => void }) {
  const { data, update, money } = useVault();
  const toast = useToast();
  const [a, setA] = useState<Account>(
    () =>
      initial ?? {
        id: crypto.randomUUID(),
        book: defaults?.book ?? 'personal',
        name: '',
        kind: 'savings',
        bank: '',
        holder: '',
        number: '',
        ifsc: '',
        branch: '',
        upi: '',
        opening: 0,
        color: ACCOUNT_COLORS[data.accounts.length % ACCOUNT_COLORS.length],
        archived: false,
        notes: '',
        createdAt: Date.now(),
      },
  );
  const [opening, setOpening] = useState(initial ? (initial.opening < 0 ? '-' : '') + toInput(Math.abs(initial.opening)) : '');
  const [error, setError] = useState('');
  const set = (patch: Partial<Account>) => setA((x) => ({ ...x, ...patch }));
  const isBank = a.kind === 'savings' || a.kind === 'current' || a.kind === 'deposit';
  const used = initial && (data.transactions.some((t) => t.accountId === a.id) || data.moves.some((m) => m.from === a.id || m.to === a.id));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = a.name.trim() || (a.kind === 'cash' ? 'Cash in hand' : a.bank.trim() ? `${a.bank.trim()} ${ACCOUNT_KIND_LABEL[a.kind].split(' ')[0]}` : '');
    if (!name) return setError('Give the account a name, like "HDFC Savings".');
    const o = toBalance(opening);
    if (o === null) return setError('Enter the opening balance as a number, like 25000 or -4500.');
    const out = { ...a, name, opening: o };
    update((d) => ({ ...d, accounts: initial ? d.accounts.map((x) => (x.id === out.id ? out : x)) : [...d.accounts, out] }));
    toast(initial ? 'Account saved' : `${name} added`);
    onClose();
  };

  const remove = () => {
    update((d) => ({
      ...d,
      accounts: d.accounts.filter((x) => x.id !== a.id),
      transactions: d.transactions.map((t) => (t.accountId === a.id ? { ...t, accountId: undefined } : t)),
      transfers: d.transfers.map((t) => ({ ...t, fromAccountId: t.fromAccountId === a.id ? undefined : t.fromAccountId, toAccountId: t.toAccountId === a.id ? undefined : t.toAccountId })),
      moves: d.moves.filter((m) => m.from !== a.id && m.to !== a.id),
    }));
    toast('Account deleted · its entries were kept');
    onClose();
  };

  return (
    <Modal
      title={initial ? `Edit ${initial.name}` : 'New account'}
      onClose={onClose}
      footer={
        <>
          {initial && (
            <div className="row">
              <button className="btn ghost" onClick={() => (update((d) => ({ ...d, accounts: d.accounts.map((x) => (x.id === a.id ? { ...x, archived: !x.archived } : x)) })), onClose())}>
                {initial.archived ? 'Reopen' : 'Mark closed'}
              </button>
              {!used && (
                <button className="btn ghost danger" onClick={remove}>
                  <Trash2 size={15} /> Delete
                </button>
              )}
            </div>
          )}
          <div className="right">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" form="acct-form">
              {initial ? 'Save' : 'Add account'}
            </button>
          </div>
        </>
      }
    >
      <form id="acct-form" className="form-grid" onSubmit={submit} autoComplete="off">
        <div className="full row between wrap">
          <Seg
            label="Belongs to"
            value={a.book}
            onChange={(book) => set({ book })}
            options={[
              { value: 'personal', label: <BookLabel book="personal" /> },
              { value: 'company', label: <BookLabel book="company" /> },
            ]}
          />
          <div className="row" style={{ gap: 6 }}>
            {ACCOUNT_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={c === a.color} onClick={() => set({ color: c })} className="swatch-btn" style={{ background: c, boxShadow: c === a.color ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : 'none' }} />
            ))}
          </div>
        </div>
        <Field label="Type">
          <select className="select" value={a.kind} onChange={(e) => set({ kind: e.target.value as AccountKind })}>
            {(Object.keys(ACCOUNT_KIND_LABEL) as AccountKind[]).map((k) => (
              <option key={k} value={k}>
                {ACCOUNT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name">
          <input className="input" value={a.name} onChange={(e) => (set({ name: e.target.value }), setError(''))} placeholder={a.kind === 'cash' ? 'Cash in hand' : 'HDFC Savings'} autoFocus />
        </Field>
        <Field label={a.kind === 'card' ? 'Balance today (negative if you owe)' : 'Balance before your first entry'} hint={`In ${money.symbol}. Kosh adds every entry from here.`}>
          <input className="input num" inputMode="decimal" value={opening} onChange={(e) => (setOpening(e.target.value.replace(/[^\d.,-]/g, '')), setError(''))} placeholder="0" />
        </Field>
        {a.kind !== 'cash' && (
          <Field label={a.kind === 'wallet' ? 'Provider' : a.kind === 'card' ? 'Card issuer' : 'Bank'}>
            <input className="input" value={a.bank} onChange={(e) => set({ bank: e.target.value })} placeholder={a.kind === 'wallet' ? 'Paytm, PhonePe…' : 'HDFC Bank'} />
          </Field>
        )}
        {isBank && (
          <>
            <Field label="Account holder">
              <input className="input" value={a.holder} onChange={(e) => set({ holder: e.target.value })} />
            </Field>
            <Field label="Account number">
              <input className="input mono" value={a.number} onChange={(e) => set({ number: e.target.value.replace(/[^\dA-Za-z ]/g, '') })} />
            </Field>
            <Field label="IFSC">
              <input className="input mono" value={a.ifsc} onChange={(e) => set({ ifsc: e.target.value.toUpperCase() })} placeholder="HDFC0001234" />
            </Field>
            <Field label="Branch">
              <input className="input" value={a.branch} onChange={(e) => set({ branch: e.target.value })} />
            </Field>
          </>
        )}
        {a.kind === 'card' && (
          <Field label="Last 4 digits">
            <input className="input mono" value={a.number} maxLength={4} onChange={(e) => set({ number: e.target.value.replace(/\D/g, '') })} />
          </Field>
        )}
        {(isBank || a.kind === 'wallet') && (
          <Field label="UPI ID">
            <input className="input mono" value={a.upi} onChange={(e) => set({ upi: e.target.value })} placeholder="name@bank" />
          </Field>
        )}
        <Field label="Notes" className="full">
          <input className="input" value={a.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Relationship manager, cheque book, where the cash box is…" />
        </Field>
        {error && <div className="error-text full">{error}</div>}
      </form>
    </Modal>
  );
}

export function MoveForm({ initial, defaults, onClose }: { initial?: Move; defaults?: { from?: string; to?: string }; onClose: () => void }) {
  const { data, update, money } = useVault();
  const toast = useToast();
  const accounts = activeAccounts(data);
  const [from, setFrom] = useState(initial?.from ?? defaults?.from ?? accounts[0]?.id ?? '');
  const fromAcc = data.accounts.find((a) => a.id === from);
  const targets = accounts.filter((a) => a.id !== from && a.book === fromAcc?.book);
  const [to, setTo] = useState(initial?.to ?? defaults?.to ?? '');
  const toId = targets.some((a) => a.id === to) ? to : targets.find((a) => a.kind === 'cash')?.id ?? targets[0]?.id ?? '';
  const [amount, setAmount] = useState(initial ? toInput(initial.amount) : '');
  const [date, setDate] = useState(initial?.date ?? today());
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState('');
  const toAcc = data.accounts.find((a) => a.id === toId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const minor = toMinor(amount);
    if (!fromAcc || !toAcc) return setError('Pick two accounts.');
    if (!minor) return setError('Enter an amount.');
    const auto = toAcc.kind === 'cash' ? 'Cash withdrawal' : fromAcc.kind === 'cash' ? 'Cash deposit' : toAcc.kind === 'card' ? 'Card bill paid' : 'Transfer';
    const m: Move = { id: initial?.id ?? crypto.randomUUID(), from: fromAcc.id, to: toAcc.id, amount: minor, date, note: note.trim() || auto, createdAt: initial?.createdAt ?? Date.now() };
    update((d) => ({ ...d, moves: initial ? d.moves.map((x) => (x.id === m.id ? m : x)) : [m, ...d.moves] }));
    toast(`${money.full(minor)} moved to ${toAcc.name}`);
    onClose();
  };

  return (
    <Modal
      title={initial ? 'Edit move' : 'Move money between accounts'}
      onClose={onClose}
      footer={
        <>
        {initial && (
          <button
            className="btn ghost danger"
            onClick={() => {
              update((d) => ({ ...d, moves: d.moves.filter((x) => x.id !== initial.id) }));
              toast('Move deleted');
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
          <button className="btn primary" form="move-form" disabled={!targets.length}>
            {initial ? 'Save' : 'Move'}
          </button>
        </div>
        </>
      }
    >
      <form id="move-form" className="stack" onSubmit={submit}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          For ATM withdrawals, cash deposits, paying a card bill, or moving between your own accounts. It isn't income or spending. To move money between you
          and the company, use <b>You &amp; Company</b>.
        </p>
        <div className="form-grid">
          <Field label="From">
            <select className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.book === 'company' ? 'Company' : 'Personal'})
                </option>
              ))}
            </select>
          </Field>
          <Field label="To">
            <select className="select" value={toId} onChange={(e) => setTo(e.target.value)} disabled={!targets.length}>
              {targets.length === 0 && <option>Add another {fromAcc?.book} account first</option>}
              {targets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Amount (${money.symbol})`}>
            <input className="input num" inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setError(''))} placeholder="0" autoFocus />
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
          </Field>
          <Field label="Note" className="full">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        {error && <div className="error-text">{error}</div>}
      </form>
    </Modal>
  );
}
