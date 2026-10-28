import { ArrowLeftRight, Banknote, Building2, CalendarClock, Check, Copy, CreditCard, Eye, EyeOff, Landmark, Pencil, PiggyBank, Plus, Scale, Smartphone, Trash2, TrendingUp, Zap } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Sparkline } from '../components/charts';
import { BookLabel } from '../components/forms';
import { activityOf, ActivityRow } from '../components/rows';
import { Empty, Field, Modal, Seg, useCopy, useToast } from '../components/ui';
import { ACCOUNT_COLORS, activeAccounts, balanceHistory, defaultAccountId, investmentStats, investmentTotals, masked, monthlySipTotal, paySip, setAccountValue } from '../lib/accounts';
import { accountBalances } from '../lib/analytics';
import { addDays, dayLabel, today } from '../lib/dates';
import { foreignFmt } from '../lib/fx';
import { toBalance, toInput, toMinor } from '../lib/money';
import { ACCOUNT_KIND_LABEL, TO_COMPANY, TO_PERSONAL, TRANSFER_LABEL, type Account, type AccountKind, type Book, type Move, type Sip, type Transfer, type TransferReason } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';
import { DateInput } from '../components/DateInput';

export const ACCOUNT_ICON: Record<AccountKind, typeof Landmark> = {
  savings: PiggyBank,
  current: Building2,
  cash: Banknote,
  card: CreditCard,
  wallet: Smartphone,
  deposit: Landmark,
  investment: TrendingUp,
};

export function Accounts() {
  const { data, money } = useVault();
  const nav = useNav();
  const [open, setOpen] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const bal = useMemo(() => accountBalances(data), [data]);

  // Investments have their own section, so book totals here are bank, cash, card and wallet money only.
  const total = (book: Book) => activeAccounts(data, book).filter((a) => a.kind !== 'investment').reduce((s, a) => s + (bal.byAccount.get(a.id) ?? 0), 0);
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
        <div className="card kpi t-violet">
          <div className="stat-l">Personal, banks &amp; cash</div>
          <div className="stat-v num">{money.compact(total('personal'))}</div>
        </div>
        <div className="card kpi t-teal">
          <div className="stat-l">{company}, banks &amp; cash</div>
          <div className="stat-v num">{money.compact(total('company'))}</div>
        </div>
        <div className="card kpi t-green">
          <div className="stat-l">
            <Banknote size={14} /> Cash in hand
          </div>
          <div className="stat-v num">{money.compact(cashInHand)}</div>
          <div className="stat-d">Count it now and then, and use “Update balance”.</div>
        </div>
        <div className="card kpi t-rose">
          <div className="stat-l">
            <CreditCard size={14} /> Owed on cards
          </div>
          <div className={`stat-v num ${cardDue < 0 ? 'down' : ''}`}>{money.compact(-cardDue)}</div>
          <div className="stat-d">{cardDue < 0 ? 'Pay before the due date to avoid interest.' : 'All cards are paid off.'}</div>
        </div>
      </div>

      <Investments onOpen={setOpen} />

      <div className="row wrap mt" style={{ justifyContent: 'flex-end' }}>
        {data.accounts.some((a) => a.archived) && (
          <button className="btn ghost sm" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Hide closed accounts' : 'Show closed accounts'}
          </button>
        )}
        <button className="btn sm" onClick={() => nav.open({ type: 'move' })}>
          <ArrowLeftRight size={14} /> Transfer money
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
  const list = data.accounts.filter((a) => a.book === book && a.kind !== 'investment' && (showArchived || !a.archived));
  const total = activeAccounts(data, book).filter((a) => a.kind !== 'investment').reduce((s, a) => s + (byAccount.get(a.id) ?? 0), 0);
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
      {a.kind === 'investment' ? (
        <InvestedLine accountId={a.id} />
      ) : (
        <div className="stat-d">{a.kind === 'card' ? (balance < 0 ? 'owed on the card' : 'in credit') : ACCOUNT_KIND_LABEL[a.kind]}</div>
      )}
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
  // Withdrawals go to cash on the same side first (personal bank → personal cash).
  const cashFor = activeAccounts(data).filter((x) => x.kind === 'cash').sort((x, y) => Number(y.book === a.book) - Number(x.book === a.book))[0];
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
            {a.kind === 'cash' ? (
              <button className="btn" onClick={() => nav.open({ type: 'move', defaults: { to: a.id } })}>
                <Banknote size={15} /> Add cash
              </button>
            ) : (
              cashFor && (
                <button className="btn" onClick={() => nav.open({ type: 'move', defaults: { from: a.id, to: cashFor.id } })}>
                  <Banknote size={15} /> Withdraw cash
                </button>
              )
            )}
            <button className="btn" onClick={() => nav.open({ type: 'move', defaults: a.kind === 'cash' ? { to: a.id } : { from: a.id } })}>
              <ArrowLeftRight size={15} /> Transfer
            </button>
            <button className="btn primary" onClick={() => setAdjusting(true)}>
              <Scale size={15} /> {a.kind === 'investment' ? 'Update value' : 'Update balance'}
            </button>
          </div>
        </>
      }
    >
      <div className="grid g-2" style={{ gap: 16, alignItems: 'start' }}>
        <div>
          <div className="stat-l">{a.kind === 'investment' ? 'Current value' : 'Balance in Kosh'}</div>
          <div className={`stat-v num ${balance < 0 ? 'down' : ''}`} style={{ fontSize: 30 }}>
            {money.full(balance)}
          </div>
          {a.kind === 'investment' ? <InvestedLine accountId={a.id} /> : <div className="stat-d">{ACCOUNT_KIND_LABEL[a.kind]}</div>}
          {data.bills.filter((b) => b.active && b.accountId === a.id).length > 0 && (
            <div className="acct-bills">
              <div className="faint" style={{ fontSize: 12 }}>
                Bills charged here
              </div>
              {data.bills
                .filter((b) => b.active && b.accountId === a.id)
                .map((b) => (
                  <div key={b.id} className="row between" style={{ fontSize: 13 }}>
                    <span className="tx-t">{b.name}</span>
                    <span className="num faint">
                      {b.fx ? foreignFmt(b.fx.currency, b.fx.amount) : money.full(b.amount)} · {dayLabel(b.nextDue)}
                    </span>
                  </div>
                ))}
            </div>
          )}
          {data.sips
            .filter((s) => s.toAccountId === a.id)
            .map((s) => (
              <div key={s.id} className="pill gold" style={{ marginTop: 10 }}>
                SIP {money.full(s.amount)} {s.frequency} · next {dayLabel(s.nextDue)}
              </div>
            ))}
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
      {adjusting && <UpdateValueModal a={a} onClose={() => setAdjusting(false)} />}
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

/** "My wallet actually has ₹3,200" / "the fund is worth ₹19,741": sets the balance to what you see. */
export function UpdateValueModal({ a, onClose }: { a: Account; onClose: () => void }) {
  const { data, update, money } = useVault();
  const toast = useToast();
  const balance = accountBalances(data).byAccount.get(a.id) ?? 0;
  const [actual, setActual] = useState(toInput(balance));
  const target = toBalance(actual);
  const diff = target === null ? 0 : target - balance;
  const isInvestment = a.kind === 'investment';
  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (target === null) return;
    if (diff) {
      update((d) => setAccountValue(d, a.id, target));
      toast(`${a.name} ${isInvestment ? 'value' : 'balance'} set to ${money.full(target)}`);
    }
    onClose();
  };
  return (
    <Modal
      title={isInvestment ? `Current value · ${a.name}` : `Update balance · ${a.name}`}
      onClose={onClose}
      footer={
        <div className="right">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" form="value-form" disabled={target === null}>
            Save
          </button>
        </div>
      }
    >
      <form id="value-form" className="stack" onSubmit={save}>
        <Field
          label={isInvestment ? 'What your app shows today (Groww, Zerodha, the AMC…)' : `What ${a.kind === 'cash' ? 'you actually have in hand' : 'the bank shows'} today`}
          hint={a.kind === 'card' ? 'For a card, enter what you owe as a negative number, like -12000.' : `Kosh has ${money.full(balance)}.`}
        >
          <div className="amount-wrap">
            <span className="cur">{money.symbol}</span>
            <input
              className="input amount-input"
              inputMode="decimal"
              value={actual}
              onChange={(e) => setActual(e.target.value.replace(/[^\d.,-]/g, ''))}
              onFocus={(e) => e.currentTarget.select()}
              autoFocus
              aria-label={isInvestment ? 'Current value' : 'Actual balance'}
            />
          </div>
        </Field>
        {target === null ? (
          <div className="error-text">Enter a number, like 19741.62</div>
        ) : diff !== 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Records a {diff > 0 ? 'gain' : isInvestment ? 'loss' : 'shortfall'} of <b className={diff > 0 ? 'up' : 'down'}>{money.full(Math.abs(diff))}</b>
            {isInvestment ? ' on this fund.' : '.'} It won't count as income or spending.
          </p>
        ) : (
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>
            Same as Kosh already has.
          </p>
        )}
      </form>
    </Modal>
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
  const isInvestment = a.kind === 'investment';
  const [currentValue, setCurrentValue] = useState(() => (initial && initial.kind === 'investment' ? toInput(accountBalances(data).byAccount.get(initial.id) ?? 0) : ''));
  const used = initial && (data.transactions.some((t) => t.accountId === a.id) || data.moves.some((m) => m.from === a.id || m.to === a.id));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = a.name.trim() || (a.kind === 'cash' ? 'Cash in hand' : a.bank.trim() ? `${a.bank.trim()} ${ACCOUNT_KIND_LABEL[a.kind].split(' ')[0]}` : '');
    if (!name) return setError('Give the account a name, like "HDFC Savings".');
    const o = toBalance(opening);
    if (o === null) return setError('Enter the opening balance as a number, like 25000 or -4500.');
    const out = { ...a, name, opening: o };
    // For a new investment, "current value" differs from what was invested by the gain so far.
    const value = isInvestment && currentValue.trim() ? toBalance(currentValue) : null;
    if (isInvestment && currentValue.trim() && value === null) return setError('Enter the current value as a number.');
    update((d) => {
      const next = { ...d, accounts: initial ? d.accounts.map((x) => (x.id === out.id ? out : x)) : [...d.accounts, out] };
      // Applied after the invested amount is saved, so the difference is pure gain or loss.
      return value !== null ? setAccountValue(next, out.id, value) : next;
    });
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
      bills: d.bills.map((b) => (b.accountId === a.id ? { ...b, accountId: undefined } : b)),
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
        <Field
          label={a.kind === 'card' ? 'Balance today (negative if you owe)' : isInvestment ? 'Amount invested so far' : 'Balance before your first entry'}
          hint={isInvestment ? 'What you put in before tracking it here. 0 if this is your first SIP.' : `In ${money.symbol}. Kosh adds every entry from here.`}
        >
          <input className="input num" inputMode="decimal" value={opening} onChange={(e) => (setOpening(e.target.value.replace(/[^\d.,-]/g, '')), setError(''))} placeholder="0" />
        </Field>
        {isInvestment && (
          <Field label={initial ? 'Current value' : 'Current value (optional)'} hint="From your app. Kosh shows the gain.">
            <input className="input num" inputMode="decimal" value={currentValue} onChange={(e) => setCurrentValue(e.target.value.replace(/[^\d.,-]/g, ''))} placeholder={opening || '0'} />
          </Field>
        )}
        {a.kind !== 'cash' && (
          <Field label={a.kind === 'wallet' ? 'Provider' : a.kind === 'card' ? 'Card issuer' : isInvestment ? 'Platform or AMC' : 'Bank'}>
            <input className="input" value={a.bank} onChange={(e) => set({ bank: e.target.value })} placeholder={a.kind === 'wallet' ? 'Paytm, PhonePe…' : isInvestment ? 'Groww, Zerodha Coin, Kuvera…' : 'HDFC Bank'} />
          </Field>
        )}
        {isInvestment && (
          <Field label="Folio number">
            <input className="input mono" value={a.number} onChange={(e) => set({ number: e.target.value.replace(/[^\dA-Za-z/ ]/g, '') })} />
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
  const company = data.settings.companyName || 'Company';
  // Investments are filled by SIPs; everything else can send or receive.
  const accounts = activeAccounts(data).filter((a) => a.kind !== 'investment');
  const firstBank = accounts.find((a) => a.kind !== 'cash') ?? accounts[0];
  const [from, setFrom] = useState(initial?.from ?? defaults?.from ?? firstBank?.id ?? '');
  const fromAcc = data.accounts.find((a) => a.id === from);
  const targets = accounts.filter((a) => a.id !== from);
  const [to, setTo] = useState(initial?.to ?? defaults?.to ?? '');
  // Default destination: cash on the same side, then anything on the same side, then anything.
  const toId = targets.some((a) => a.id === to)
    ? to
    : targets.find((a) => a.kind === 'cash' && a.book === fromAcc?.book)?.id ?? targets.find((a) => a.book === fromAcc?.book)?.id ?? targets.find((a) => a.kind === 'cash')?.id ?? targets[0]?.id ?? '';
  const toAcc = data.accounts.find((a) => a.id === toId);
  const crossBook = !!fromAcc && !!toAcc && fromAcc.book !== toAcc.book;
  const toCompany = crossBook && toAcc!.book === 'company';
  const reasons: TransferReason[] = toCompany ? TO_COMPANY : TO_PERSONAL;
  const [reasonChoice, setReason] = useState<TransferReason | ''>('');
  const reason: TransferReason = reasonChoice && reasons.includes(reasonChoice) ? reasonChoice : reasons[0];
  const [amount, setAmount] = useState(initial ? toInput(initial.amount) : '');
  const [date, setDate] = useState(initial?.date ?? today());
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState('');

  const help: Record<TransferReason, string> = {
    capital: `Your money invested in ${company}. Not paid back.`,
    loan: `${company} owes this back to you.`,
    salary: `Your income, and a ${company} expense.`,
    dividend: 'Your income from profits. Not a company expense.',
    repayment: `${company} paying back a loan you gave it.`,
    reimbursement: `${company} paying you back for bills you covered.`,
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const minor = toMinor(amount);
    if (!fromAcc || !toAcc) return setError('Pick where the money comes from and where it goes.');
    if (!minor) return setError('Enter an amount.');
    if (crossBook) {
      // Between you and the company: a proper transfer, so P&L and "owed to you" stay right.
      const t: Transfer = { id: crypto.randomUUID(), reason, amount: minor, date, note: note.trim(), fromAccountId: fromAcc.id, toAccountId: toAcc.id, createdAt: Date.now() };
      update((d) => ({ ...d, transfers: [t, ...d.transfers] }));
      toast(`${TRANSFER_LABEL[reason]}: ${money.full(minor)} to ${toAcc.name}`);
      return onClose();
    }
    const auto = toAcc.kind === 'cash' ? 'Cash withdrawal' : fromAcc.kind === 'cash' ? 'Cash deposit' : toAcc.kind === 'card' ? 'Card bill paid' : 'Transfer';
    const m: Move = { id: initial?.id ?? crypto.randomUUID(), from: fromAcc.id, to: toAcc.id, amount: minor, date, note: note.trim() || auto, createdAt: initial?.createdAt ?? Date.now() };
    update((d) => ({ ...d, moves: initial ? d.moves.map((x) => (x.id === m.id ? m : x)) : [m, ...d.moves] }));
    toast(`${money.full(minor)} moved to ${toAcc.name}`);
    onClose();
  };

  const group = (book: Book, list: Account[]) => {
    const items = list.filter((a) => a.book === book);
    return items.length ? (
      <optgroup label={book === 'company' ? company : 'Personal'}>
        {items.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.kind === 'cash' ? ' (cash)' : a.number ? ` · ${masked(a.number)}` : ''}
          </option>
        ))}
      </optgroup>
    ) : null;
  };

  return (
    <Modal
      title={initial ? 'Edit transfer' : 'Transfer money'}
      onClose={onClose}
      footer={
        <>
          {initial && (
            <button
              className="btn ghost danger"
              onClick={() => {
                update((d) => ({ ...d, moves: d.moves.filter((x) => x.id !== initial.id) }));
                toast('Transfer deleted');
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
              {initial ? 'Save' : 'Transfer'}
            </button>
          </div>
        </>
      }
    >
      <form id="move-form" className="stack" onSubmit={submit}>
        {accounts.length < 2 ? (
          <p className="muted" style={{ margin: 0 }}>
            Add at least two accounts first, for example your bank account and your cash in hand.
          </p>
        ) : (
          <>
            <div className="form-grid">
              <Field label="From">
                <select className="select" value={from} onChange={(e) => (setFrom(e.target.value), setError(''))} disabled={!!initial}>
                  {group('personal', accounts)}
                  {group('company', accounts)}
                </select>
              </Field>
              <Field label="To">
                <select className="select" value={toId} onChange={(e) => (setTo(e.target.value), setError(''))} disabled={!!initial}>
                  {group('personal', targets)}
                  {group('company', targets)}
                </select>
              </Field>
              <Field label={`Amount (${money.symbol})`}>
                <input className="input num" inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setError(''))} placeholder="0" autoFocus />
              </Field>
              <Field label="Date">
                <DateInput value={date} onChange={(v) => setDate(v || today())} />
              </Field>
              {crossBook && (
                <Field label={toCompany ? `You → ${company}: what is it?` : `${company} → you: what is it?`} hint={help[reason]} className="full">
                  <select className="select" value={reason} onChange={(e) => setReason(e.target.value as TransferReason)}>
                    {reasons.map((r) => (
                      <option key={r} value={r}>
                        {TRANSFER_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Note" className="full">
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
              </Field>
            </div>
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
              {crossBook
                ? `Between you and ${company}: recorded under You & Company.`
                : toAcc?.kind === 'cash'
                  ? 'A cash withdrawal: your money just changes place. Not income or spending.'
                  : 'Between your own accounts: not income or spending.'}
            </p>
          </>
        )}
        {error && <div className="error-text">{error}</div>}
      </form>
    </Modal>
  );
}

/* ───────── Investments & SIPs ───────── */

/** "+5.17%" / "−5.17%": two decimals so similar returns stay distinguishable. */
export function pct(gain: number, invested: number): string {
  if (!invested || !gain) return '0.00%';
  return `${gain > 0 ? '+' : '−'}${Math.abs((gain / invested) * 100).toFixed(2)}%`;
}


function InvestedLine({ accountId }: { accountId: string }) {
  const { data, money } = useVault();
  const s = investmentStats(data, accountId);
  return (
    <div className="stat-d">
      invested {money.compact(s.invested)}
      {s.gain !== 0 && (
        <span className={s.gain > 0 ? 'up' : 'down'} style={{ fontWeight: 600 }}>
          {' '}
          · {s.gain > 0 ? '+' : '−'}
          {money.compact(Math.abs(s.gain))}
          {s.returnPct !== null && ` (${pct(s.gain, s.invested)})`}
        </span>
      )}
    </div>
  );
}

/** Records the instalment on its due date (or today, if paying early). */
export function usePaySip() {
  const { update, money } = useVault();
  const toast = useToast();
  return (sip: Sip) => {
    const t = today();
    update((d) => paySip(d, sip, sip.nextDue <= t ? sip.nextDue : t));
    toast(`${money.full(sip.amount)} invested in ${sip.name}`);
  };
}

function Investments({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, money } = useVault();
  const [valuing, setValuing] = useState<Account | null>(null);
  const nav = useNav();
  const pay = usePaySip();
  const t = today();
  const totals = investmentTotals(data);
  const hasInvestments = data.accounts.some((a) => a.kind === 'investment' && !a.archived) || data.sips.length > 0;

  if (!hasInvestments) {
    return (
      <div className="card row between wrap mt" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          <div className="acct-ico" style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}>
            <TrendingUp size={17} />
          </div>
          <div>
            <b>Track your SIPs and investments</b>
            <div className="muted" style={{ fontSize: 13 }}>
              Add a monthly SIP. Kosh reminds you, moves the money on “Done”, and shows what you've invested against what it's worth.
            </div>
          </div>
        </div>
        <button className="btn primary sm" onClick={() => nav.open({ type: 'sip' })}>
          <Plus size={14} /> Add a SIP
        </button>
      </div>
    );
  }

  const sips = [...data.sips].sort((a, b) => Number(b.active) - Number(a.active) || (a.nextDue < b.nextDue ? -1 : 1));
  return (
    <>
      <div className="row between mt-lg" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ fontSize: 17, margin: 0 }}>
          <TrendingUp size={17} style={{ verticalAlign: -3, color: 'var(--gold)', marginRight: 6 }} />
          Investments &amp; SIPs
        </h2>
        <button className="btn ghost sm" onClick={() => nav.open({ type: 'sip' })}>
          <Plus size={14} /> SIP
        </button>
      </div>
      <div className="grid g-main">
        <div className="card">
          <div className="grid g-3" style={{ gap: 12 }}>
            <div>
              <div className="stat-l">Invested</div>
              <div className="stat-v num" style={{ fontSize: 22 }}>
                {money.full(totals.invested)}
              </div>
            </div>
            <div>
              <div className="stat-l">Current value</div>
              <div className="stat-v num" style={{ fontSize: 22 }}>
                {money.full(totals.value)}
              </div>
            </div>
            <div>
              <div className="stat-l">Gain</div>
              <div className={`stat-v num ${totals.gain > 0 ? 'up' : totals.gain < 0 ? 'down' : ''}`} style={{ fontSize: 22 }}>
                {totals.gain > 0 ? '+' : totals.gain < 0 ? '−' : ''}
                {money.full(Math.abs(totals.gain))}
              </div>
              <div className="stat-d">{totals.returnPct === null ? 'Update the value to see returns' : `${pct(totals.gain, totals.invested)} overall`}</div>
            </div>
          </div>
          <div className="fund-table mt">
            <div className="fund-row fund-head">
              <span>Fund</span>
              <span>Invested</span>
              <span>Value</span>
              <span>Return</span>
              <span />
            </div>
            {activeAccounts(data)
              .filter((a) => a.kind === 'investment')
              .map((a) => {
                const s = investmentStats(data, a.id);
                return (
                  <div key={a.id} className="fund-row">
                    <button className="fund-name" onClick={() => onOpen(a.id)} title={a.name}>
                      <i className="swatch" style={{ background: a.color }} />
                      <span>{a.name}</span>
                    </button>
                    <span className="num faint">{money.full(s.invested)}</span>
                    <span className="num">{money.full(s.value)}</span>
                    <span className={`fund-return num ${s.gain > 0 ? 'up' : s.gain < 0 ? 'down' : 'faint'}`}>
                      {s.returnPct === null || s.gain === 0 ? (
                        '—'
                      ) : (
                        <>
                          {pct(s.gain, s.invested)}
                          <small>
                            {s.gain > 0 ? '+' : '−'}
                            {money.full(Math.abs(s.gain))}
                          </small>
                        </>
                      )}
                    </span>
                    <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setValuing(a)} aria-label={`Update current value of ${a.name}`} title="Update current value">
                      <Pencil size={14} />
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
        <div className="card">
          <div className="card-h">
            <div>
              <h2>Your SIPs</h2>
              <div className="sub">{money.full(monthlySipTotal(data))} a month</div>
            </div>
          </div>
          {sips.length === 0 && <p className="muted" style={{ margin: 0 }}>No SIPs yet.</p>}
          <div className="stack" style={{ gap: 12 }}>
            {sips.map((s) => {
              const overdue = s.active && s.nextDue < t;
              const soon = s.active && s.nextDue <= addDays(t, 3);
              const from = data.accounts.find((a) => a.id === s.fromAccountId);
              return (
                <div key={s.id} className="sip-row" style={{ opacity: s.active ? 1 : 0.5 }}>
                  <CalendarClock size={16} style={{ color: overdue ? 'var(--expense)' : soon ? 'var(--warn)' : 'var(--text-3)' }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="tx-t" style={{ fontSize: 13.5 }} title={s.name}>
                      {s.name}
                    </div>
                    <div className="tx-s" style={{ fontSize: 12 }}>
                      {!s.active ? 'Paused' : overdue ? <span className="down">Due {dayLabel(s.nextDue)}</span> : `Next ${dayLabel(s.nextDue)}`}
                      {from && ` · from ${from.name}`}
                      {s.autopay && (
                        <>
                          {' · '}
                          <Zap size={11} /> auto-debit
                        </>
                      )}
                    </div>
                  </div>
                  <b className="num" style={{ fontSize: 13.5 }}>
                    {money.full(s.amount)}
                  </b>
                  <div className="row" style={{ gap: 2 }}>
                    {s.active && (
                      <button className={`btn sm ${soon ? 'primary' : ''}`} onClick={() => pay(s)} title="Record this instalment">
                        <Check size={14} /> Done
                      </button>
                    )}
                    <button className="icon-btn" onClick={() => nav.open({ type: 'sip', initial: s })} aria-label={`Edit ${s.name}`}>
                      <Pencil size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {valuing && <UpdateValueModal a={valuing} onClose={() => setValuing(null)} />}
    </>
  );
}

export function SipForm({ initial, onClose }: { initial?: Sip; onClose: () => void }) {
  const { data, update, money } = useVault();
  const toast = useToast();
  const funds = activeAccounts(data, 'personal').filter((a) => a.kind === 'investment');
  const banks = activeAccounts(data, 'personal').filter((a) => a.kind !== 'investment' && a.kind !== 'card');
  const [name, setName] = useState(initial?.name ?? '');
  const [platform, setPlatform] = useState('');
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? funds[0]?.id ?? 'new');
  const [fromAccountId, setFromAccountId] = useState(initial?.fromAccountId ?? defaultAccountId(data, 'personal') ?? banks[0]?.id ?? '');
  const [amount, setAmount] = useState(initial ? toInput(initial.amount) : '');
  const [frequency, setFrequency] = useState<Sip['frequency']>(initial?.frequency ?? 'monthly');
  const [nextDue, setNextDue] = useState(initial?.nextDue ?? today());
  const [autopay, setAutopay] = useState(initial?.autopay ?? true);
  const [active, setActive] = useState(initial?.active ?? true);
  const [invested, setInvested] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const isNewFund = toAccountId === 'new';
  const fundBalance = (id: string) => accountBalances(data).byAccount.get(id) ?? 0;
  // For an existing fund, its current value can be corrected right here.
  const [fundValue, setFundValue] = useState(() => (toAccountId !== 'new' ? toInput(fundBalance(toAccountId)) : ''));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fundName = name.trim();
    if (!fundName) return setError('Which fund? For example "Parag Parikh Flexi Cap".');
    const minor = toMinor(amount);
    if (!minor) return setError('Enter the SIP amount.');
    if (!fromAccountId) return setError('Add a personal bank account first, so Kosh knows where the money comes from.');
    const already = toBalance(invested);
    if (isNewFund && already === null) return setError('Enter the amount already invested as a number, or leave it empty.');
    const currentValue = isNewFund && value.trim() ? toBalance(value) : null;
    const existingValue = !isNewFund && fundValue.trim() ? toBalance(fundValue) : null;
    if (!isNewFund && fundValue.trim() && existingValue === null) return setError('Enter the current value as a number.');

    update((d) => {
      let accounts = d.accounts;
      let transactions = d.transactions;
      let fundId = toAccountId;
      if (isNewFund) {
        const fund: Account = {
          id: crypto.randomUUID(),
          book: 'personal',
          name: fundName,
          kind: 'investment',
          bank: platform.trim(),
          holder: '',
          number: '',
          ifsc: '',
          branch: '',
          upi: '',
          opening: already ?? 0,
          color: ACCOUNT_COLORS[(d.accounts.length + 3) % ACCOUNT_COLORS.length],
          archived: false,
          notes: '',
          createdAt: Date.now(),
        };
        fundId = fund.id;
        accounts = [...accounts, fund];
        const gain = currentValue !== null ? currentValue - fund.opening : 0;
        if (gain) {
          transactions = [
            { id: crypto.randomUUID(), book: 'personal', kind: gain > 0 ? 'income' : 'expense', amount: Math.abs(gain), category: 'Balance adjustment', date: today(), note: `${fundName} value updated`, accountId: fund.id, adjustment: true, createdAt: Date.now() },
            ...transactions,
          ];
        }
      }
      const sip: Sip = { id: initial?.id ?? crypto.randomUUID(), name: fundName, fromAccountId, toAccountId: fundId, amount: minor, frequency, nextDue, autopay, active, createdAt: initial?.createdAt ?? Date.now() };
      const next = { ...d, accounts, transactions, sips: initial ? d.sips.map((x) => (x.id === sip.id ? sip : x)) : [...d.sips, sip] };
      return existingValue !== null ? setAccountValue(next, fundId, existingValue) : next;
    });
    toast(initial ? 'SIP saved' : `SIP of ${money.full(minor)} added`);
    onClose();
  };

  return (
    <Modal
      title={initial ? `Edit ${initial.name}` : 'New SIP'}
      onClose={onClose}
      footer={
        <>
          {initial && (
            <button
              className="btn ghost danger"
              onClick={() => {
                update((d) => ({ ...d, sips: d.sips.filter((x) => x.id !== initial.id) }));
                toast('SIP deleted · past instalments were kept');
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
            <button className="btn primary" form="sip-form">
              {initial ? 'Save' : 'Add SIP'}
            </button>
          </div>
        </>
      }
    >
      <form id="sip-form" className="form-grid" onSubmit={submit}>
        <Field label="Fund">
          <input className="input" value={name} onChange={(e) => (setName(e.target.value), setError(''))} placeholder="Parag Parikh Flexi Cap" autoFocus />
        </Field>
        <Field label={`Amount (${money.symbol})`}>
          <input className="input num" inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setError(''))} placeholder="1500" />
        </Field>
        <Field label="Repeats">
          <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value as Sip['frequency'])}>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="quarterly">Quarterly</option>
          </select>
        </Field>
        <Field label="Next SIP date" hint="Kosh rolls it forward each time you mark it done.">
          <DateInput value={nextDue} onChange={(v) => setNextDue(v || today())} />
        </Field>
        <Field label="Debited from">
          <select className="select" value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
            {banks.length === 0 && <option value="">Add a personal bank account first</option>}
            {banks.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.number ? ` · ${masked(a.number)}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Invests into">
          <select
            className="select"
            value={toAccountId}
            onChange={(e) => {
              setToAccountId(e.target.value);
              setFundValue(e.target.value !== 'new' ? toInput(fundBalance(e.target.value)) : '');
            }}
          >
            {funds.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value="new">A new fund (named above)</option>
          </select>
        </Field>
        {!isNewFund && (
          <Field label="Current value of this fund" hint="From your app. Change it to update your gain." className="full">
            <input className="input num" inputMode="decimal" value={fundValue} onChange={(e) => (setFundValue(e.target.value.replace(/[^\d.,-]/g, '')), setError(''))} />
          </Field>
        )}
        {isNewFund && (
          <>
            <Field label="Platform or AMC">
              <input className="input" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Groww, Zerodha Coin, Kuvera…" />
            </Field>
            <Field label="Already invested" hint="0 if this is the first instalment.">
              <input className="input num" inputMode="decimal" value={invested} onChange={(e) => setInvested(e.target.value.replace(/[^\d.,-]/g, ''))} placeholder="0" />
            </Field>
            <Field label="Current value (optional)" hint="From your app. Kosh shows your gain." className="full">
              <input className="input num" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,-]/g, ''))} placeholder={invested || '0'} />
            </Field>
          </>
        )}
        <label className="check">
          <input type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} />
          Auto-debit (mandate set up with the bank)
        </label>
        {initial && (
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
        )}
        <p className="faint full" style={{ margin: 0, fontSize: 12.5 }}>
          Each instalment moves money from your bank into the fund. It counts as savings, not spending, so your savings rate stays accurate.
        </p>
        {error && <div className="error-text full">{error}</div>}
      </form>
    </Modal>
  );
}
