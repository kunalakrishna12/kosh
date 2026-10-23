import { ArrowLeftRight, Briefcase, User } from 'lucide-react';
import { TO_COMPANY, TRANSFER_LABEL, type Transaction, type Transfer } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';

export type Activity = { kind: 'tx'; date: string; createdAt: number; tx: Transaction } | { kind: 'transfer'; date: string; createdAt: number; tr: Transfer };

export function activityOf(transactions: Transaction[], transfers: Transfer[]): Activity[] {
  return [
    ...transactions.map((tx) => ({ kind: 'tx' as const, date: tx.date, createdAt: tx.createdAt, tx })),
    ...transfers.map((tr) => ({ kind: 'transfer' as const, date: tr.date, createdAt: tr.createdAt, tr })),
  ].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

export function ActivityRow({ a }: { a: Activity }) {
  const { data, money } = useVault();
  const nav = useNav();
  const company = data.settings.companyName || 'Company';

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
          <div className="tx-s">{toCompany ? `You → ${company}` : `${company} → You`}{t.note ? ` · ${t.note}` : ''}</div>
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
    </div>
  );
}
