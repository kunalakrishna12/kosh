import { ArrowLeftRight, Briefcase, Repeat, User } from 'lucide-react';
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

export function ActivityRow({ a }: { a: Activity }) {
  const { data, money } = useVault();
  const nav = useNav();
  const company = data.settings.companyName || 'Company';
  const acct = (id?: string) => (id ? data.accounts.find((x) => x.id === id)?.name : undefined);

  if (a.kind === 'move') {
    const m = a.mv;
    return (
      <div className="tx" role="button" tabIndex={0} onClick={() => nav.open({ type: 'move', initial: m })} onKeyDown={(e) => e.key === 'Enter' && nav.open({ type: 'move', initial: m })}>
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
      </div>
    );
  }

  if (a.kind === 'transfer') {
    const t = a.tr;
    const toCompany = TO_COMPANY.includes(t.reason);
    return (
      <div className="tx" role="button" tabIndex={0} onClick={() => nav.open({ type: 'transfer', initial: t })} onKeyDown={(e) => e.key === 'Enter' && nav.open({ type: 'transfer', initial: t })}>
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
      </div>
    );
  }

  const t = a.tx;
  const project = t.projectId ? data.projects.find((p) => p.id === t.projectId) : undefined;
  return (
    <div className="tx" role="button" tabIndex={0} onClick={() => nav.open({ type: 'tx', initial: t })} onKeyDown={(e) => e.key === 'Enter' && nav.open({ type: 'tx', initial: t })}>
      <div className={`tx-ico ${t.book}`}>{t.book === 'personal' ? <User size={16} /> : <Briefcase size={16} />}</div>
      <div style={{ minWidth: 0 }}>
        <div className="tx-t">{t.note || t.category}</div>
        <div className="tx-s">
          {t.category}
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
        {t.adjustment && <span className="pill">Balance update</span>}
        {t.paidPersonally && <span className="pill gold">Paid by you</span>}
        <span className={`pill ${t.book}`}>{t.book === 'personal' ? 'Personal' : 'Company'}</span>
      </div>
      <div className={`tx-a num ${t.kind === 'income' ? 'up' : ''}`}>
        {t.kind === 'income' ? '+' : '−'}
        {money.full(t.amount)}
      </div>
    </div>
  );
}
