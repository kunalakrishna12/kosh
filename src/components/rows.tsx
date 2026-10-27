import { ArrowLeftRight, Briefcase, Check, Repeat, Scale, TrendingDown, TrendingUp, User } from 'lucide-react';
import { foreignFmt } from '../lib/fx';
import type { VaultData } from '../lib/types';
import { TO_COMPANY, TRANSFER_LABEL, type Move, type Transaction, type Transfer } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';

export type Activity =
  | { kind: 'tx'; date: string; createdAt: number; tx: Transaction }
  | { kind: 'transfer'; date: string; createdAt: number; tr: Transfer }
  | { kind: 'move'; date: string; createdAt: number; mv: Move };

export const activityKey = (a: Activity) => (a.kind === 'tx' ? a.tx.id : a.kind === 'transfer' ? a.tr.id : a.mv.id);

export function activityOf(transactions: Transaction[], transfers: Transfer[], moves: Move[] = []): Activity[] {
  return [
    ...transactions.map((tx) => ({ kind: 'tx' as const, date: tx.date, createdAt: tx.createdAt, tx })),
    ...transfers.map((tr) => ({ kind: 'transfer' as const, date: tr.date, createdAt: tr.createdAt, tr })),
    ...moves.map((mv) => ({ kind: 'move' as const, date: mv.date, createdAt: mv.createdAt, mv })),
  ].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

export const isChecked = (a: Activity) => !!(a.kind === 'tx' ? a.tx.checked : a.kind === 'transfer' ? a.tr.checked : a.mv.checked);

/** Sets the ✓ on any kind of entry. */
export function setChecked(d: VaultData, a: Activity, checked: boolean): VaultData {
  const id = activityKey(a);
  if (a.kind === 'tx') return { ...d, transactions: d.transactions.map((t) => (t.id === id ? { ...t, checked } : t)) };
  if (a.kind === 'transfer') return { ...d, transfers: d.transfers.map((t) => (t.id === id ? { ...t, checked } : t)) };
  return { ...d, moves: d.moves.map((m) => (m.id === id ? { ...m, checked } : m)) };
}

/** The ✓ at the end of a row: ticks the entry off against your statement. */
function Tick({ a }: { a: Activity }) {
  const { update } = useVault();
  const on = isChecked(a);
  return (
    <button
      className={`tick ${on ? 'on' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        update((d) => setChecked(d, a, !on));
      }}
      onKeyDown={(e) => e.stopPropagation()}
      aria-pressed={on}
      aria-label={on ? 'Checked against statement. Click to un-mark' : 'Mark as checked against statement'}
      title={on ? 'Checked ✓' : 'Mark as checked'}
    >
      <Check size={14} />
    </button>
  );
}

export function ActivityRow({ a }: { a: Activity }) {
  const { data, money } = useVault();
  const nav = useNav();
  const company = data.settings.companyName || 'Company';
  const acct = (id?: string) => (id ? data.accounts.find((x) => x.id === id)?.name : undefined);

  if (a.kind === 'move') {
    const m = a.mv;
    return (
      <div className={`tx activity ${isChecked(a) ? "is-checked" : ""}`} role="button" tabIndex={0} onClick={() => nav.open({ type: 'move', initial: m })} onKeyDown={(e) => e.key === 'Enter' && nav.open({ type: 'move', initial: m })}>
        <div className="tx-ico transfer">
          <Repeat size={16} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="tx-t">{m.note || 'Moved between accounts'}</div>
          <div className="tx-s">
            {acct(m.from) ?? 'Deleted account'} → {acct(m.to) ?? 'Deleted account'}
          </div>
        </div>
        <div className="tx-meta">
          <span className="pill">Own accounts</span>
        </div>
        <div className="tx-a num">{money.full(m.amount)}</div>
        <Tick a={a} />
      </div>
    );
  }

  if (a.kind === 'transfer') {
    const t = a.tr;
    const toCompany = TO_COMPANY.includes(t.reason);
    return (
      <div className={`tx activity ${isChecked(a) ? "is-checked" : ""}`} role="button" tabIndex={0} onClick={() => nav.open({ type: 'transfer', initial: t })} onKeyDown={(e) => e.key === 'Enter' && nav.open({ type: 'transfer', initial: t })}>
        <div className="tx-ico transfer">
          <ArrowLeftRight size={16} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="tx-t">{TRANSFER_LABEL[t.reason]}</div>
          <div className="tx-s">
            {toCompany ? `You → ${company}` : `${company} → You`}
            {t.note ? ` · ${t.note}` : ''}
            {acct(t.fromAccountId) || acct(t.toAccountId) ? ` · ${acct(t.fromAccountId) ?? '…'} → ${acct(t.toAccountId) ?? '…'}` : ''}
          </div>
        </div>
        <div className="tx-meta">
          <span className="pill gold">Transfer</span>
        </div>
        <div className="tx-a num">{money.full(t.amount)}</div>
        <Tick a={a} />
      </div>
    );
  }

  const t = a.tx;

  // A value change or balance correction: no money moved in or out, so it must not look like spending.
  if (t.adjustment) {
    const account = data.accounts.find((x) => x.id === t.accountId);
    const market = account?.kind === 'investment';
    const up = t.kind === 'income';
    return (
      <div className="tx adjust" role="button" tabIndex={0} onClick={() => nav.go('accounts')} onKeyDown={(e) => e.key === 'Enter' && nav.go('accounts')} title="Not income or spending: no money moved">
        <div className={`tx-ico ${up ? 'gain' : 'loss'}`}>{market ? up ? <TrendingUp size={16} /> : <TrendingDown size={16} /> : <Scale size={16} />}</div>
        <div style={{ minWidth: 0 }}>
          <div className="tx-t">{market ? `${account.name}: market value ${up ? 'up' : 'down'}` : `${account?.name ?? 'Account'}: balance corrected`}</div>
          <div className="tx-s">{market ? 'Gain or loss on the fund · no money left or entered your bank' : 'Updated to the real balance · not income or spending'}</div>
        </div>
        <div className="tx-meta">
          <span className="pill">{market ? 'Market value' : 'Balance update'}</span>
        </div>
        <div className={`tx-a num ${up ? 'up' : 'down'}`} style={{ fontWeight: 500, opacity: 0.85 }}>
          {up ? '+' : '−'}
          {money.full(t.amount)}
        </div>
      </div>
    );
  }

  const project = t.projectId ? data.projects.find((p) => p.id === t.projectId) : undefined;
  return (
    <div className={`tx activity ${isChecked(a) ? "is-checked" : ""}`} role="button" tabIndex={0} onClick={() => nav.open({ type: 'tx', initial: t })} onKeyDown={(e) => e.key === 'Enter' && nav.open({ type: 'tx', initial: t })}>
      <div className={`tx-ico ${t.book}`}>{t.book === 'personal' ? <User size={16} /> : <Briefcase size={16} />}</div>
      <div style={{ minWidth: 0 }}>
        <div className="tx-t">{t.note || t.category}</div>
        <div className="tx-s">
          {t.category}
          {t.fx && (
            <>
              <span>·</span>
              {foreignFmt(t.fx.currency, t.fx.amount)} @ {money.symbol}
              {(t.amount / t.fx.amount).toFixed(2)}
            </>
          )}
          {acct(t.accountId) && (
            <>
              <span>·</span>
              {acct(t.accountId)}
            </>
          )}
          {project && (
            <>
              <span>·</span>
              <i className="swatch" style={{ background: project.color }} />
              {project.name}
            </>
          )}
        </div>
      </div>
      <div className="tx-meta">
        {t.paidPersonally && <span className="pill gold">Paid by you</span>}
        <span className={`pill ${t.book}`}>{t.book === 'personal' ? 'Personal' : 'Company'}</span>
      </div>
      <div className={`tx-a num ${t.kind === 'income' ? 'up' : ''}`}>
        {t.kind === 'income' ? '+' : '−'}
        {money.full(t.amount)}
      </div>
      <Tick a={a} />
    </div>
  );
}
