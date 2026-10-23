import { Download, Search, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { activityOf, ActivityRow, type Activity } from '../components/rows';
import { download, Empty, Seg } from '../components/ui';
import { dayLabel, lastMonths, monthLabel } from '../lib/dates';
import { TRANSFER_LABEL, type Book } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';

type KindFilter = 'all' | 'income' | 'expense' | 'transfer';

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function Money() {
  const { data, money } = useVault();
  const nav = useNav();
  const [q, setQ] = useState('');
  const [book, setBook] = useState<Book | 'all'>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [month, setMonth] = useState('');
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(150);

  const categories = useMemo(() => [...new Set(data.transactions.filter((t) => book === 'all' || t.book === book).map((t) => t.category))].sort(), [data.transactions, book]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return activityOf(data.transactions, data.transfers).filter((a) => {
      if (month && !a.date.startsWith(month)) return false;
      if (a.kind === 'transfer') {
        if (kind !== 'all' && kind !== 'transfer') return false;
        if (category) return false;
        return !term || `${TRANSFER_LABEL[a.tr.reason]} ${a.tr.note}`.toLowerCase().includes(term);
      }
      const t = a.tx;
      if (kind === 'transfer') return false;
      if (kind !== 'all' && t.kind !== kind) return false;
      if (book !== 'all' && t.book !== book) return false;
      if (category && t.category !== category) return false;
      if (!term) return true;
      const project = t.projectId ? data.projects.find((p) => p.id === t.projectId)?.name ?? '' : '';
      return `${t.note} ${t.category} ${project} ${money.full(t.amount)}`.toLowerCase().includes(term);
    });
  }, [data, q, book, kind, month, category, money]);

  const totals = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const a of rows) if (a.kind === 'tx') a.tx.kind === 'income' ? (inc += a.tx.amount) : (exp += a.tx.amount);
    return { inc, exp };
  }, [rows]);

  const groups = useMemo(() => {
    const out: { date: string; items: Activity[]; net: number }[] = [];
    for (const a of rows.slice(0, limit)) {
      let g = out[out.length - 1];
      if (!g || g.date !== a.date) out.push((g = { date: a.date, items: [], net: 0 }));
      g.items.push(a);
      if (a.kind === 'tx') g.net += a.tx.kind === 'income' ? a.tx.amount : -a.tx.amount;
    }
    return out;
  }, [rows, limit]);

  const exportCsv = () => {
    const head = ['date', 'book', 'type', 'category', 'amount', 'project', 'paid_personally', 'note'];
    const lines = rows.map((a) =>
      a.kind === 'tx'
        ? [a.tx.date, a.tx.book, a.tx.kind, a.tx.category, (a.tx.amount / 100).toFixed(2), data.projects.find((p) => p.id === a.tx.projectId)?.name ?? '', a.tx.paidPersonally ? 'yes' : '', a.tx.note]
        : [a.tr.date, 'transfer', a.tr.reason, TRANSFER_LABEL[a.tr.reason], (a.tr.amount / 100).toFixed(2), '', '', a.tr.note],
    );
    const csv = [head, ...lines].map((l) => l.map(csvCell).join(',')).join('\n');
    download(new Blob([csv], { type: 'text/csv' }), `kosh-transactions${month ? `-${month}` : ''}.csv`);
  };

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search size={15} />
          <input className="input" placeholder="Search notes, categories, projects…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transactions" />
        </div>
        <Seg
          label="Book"
          value={book}
          onChange={(v) => (setBook(v), setCategory(''))}
          options={[
            { value: 'all', label: 'All' },
            { value: 'personal', label: 'Personal' },
            { value: 'company', label: 'Company' },
          ]}
        />
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} aria-label="Type">
          <option value="all">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="transfer">Transfers</option>
        </select>
        <select className="select" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
          <option value="">All time</option>
          {lastMonths(18)
            .reverse()
            .map((m) => (
              <option key={m} value={m}>
                {monthLabel(m, true)}
              </option>
            ))}
        </select>
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="btn" onClick={exportCsv} disabled={!rows.length} title="Export what you see as CSV (not encrypted)">
          <Download size={15} /> CSV
        </button>
      </div>

      <div className="card flush">
        <div className="strip">
          <div>
            <div className="stat-l">Money in</div>
            <div className="stat-v num up" style={{ fontSize: 22 }}>
              {money.full(totals.inc)}
            </div>
          </div>
          <div>
            <div className="stat-l">Money out</div>
            <div className="stat-v num" style={{ fontSize: 22 }}>
              {money.full(totals.exp)}
            </div>
          </div>
          <div>
            <div className="stat-l">Net · {rows.length} entries</div>
            <div className={`stat-v num ${totals.inc - totals.exp >= 0 ? 'up' : 'down'}`} style={{ fontSize: 22 }}>
              {totals.inc - totals.exp >= 0 ? '+' : '−'}
              {money.full(Math.abs(totals.inc - totals.exp))}
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <Empty
            icon={<Wallet size={22} />}
            title={data.transactions.length ? 'Nothing matches these filters' : 'No entries yet'}
            action={
              <button className="btn primary" onClick={() => nav.open({ type: 'tx' })}>
                Add an entry
              </button>
            }
          />
        ) : (
          <div className="list">
            {groups.map((g) => (
              <section key={g.date}>
                <div className="list-day">
                  <span>{dayLabel(g.date)}</span>
                  <span className={`num ${g.net > 0 ? 'up' : ''}`}>{g.net ? `${g.net > 0 ? '+' : '−'}${money.full(Math.abs(g.net))}` : ''}</span>
                </div>
                {g.items.map((a) => (
                  <ActivityRow key={a.kind === 'tx' ? a.tx.id : a.tr.id} a={a} />
                ))}
              </section>
            ))}
            {rows.length > limit && (
              <div style={{ padding: 16, textAlign: 'center' }}>
                <button className="btn" onClick={() => setLimit((l) => l + 300)}>
                  Show more ({rows.length - limit} left)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
