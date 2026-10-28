import { FolderKanban, Pencil, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Bars } from '../components/charts';
import { activityKey, activityOf, ActivityRow } from '../components/rows';
import { Bar, Empty, Modal, Seg } from '../components/ui';
import { projectStats } from '../lib/analytics';
import { monthKey, monthLabel } from '../lib/dates';
import type { Project, ProjectStatus } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';

const STATUS: Record<ProjectStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'good' },
  paused: { label: 'Paused', cls: 'warn' },
  done: { label: 'Done', cls: '' },
};

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

export function Projects() {
  const { data, money } = useVault();
  const nav = useNav();
  const [filter, setFilter] = useState<'active' | 'all' | 'done'>('active');
  const [openId, setOpenId] = useState<string | null>(nav.focusProject);
  useEffect(() => setOpenId(nav.focusProject), [nav.focusProject]);

  const list = data.projects
    .filter((p) => (filter === 'all' ? true : filter === 'done' ? p.status === 'done' : p.status !== 'done'))
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  const totals = useMemo(() => {
    let contract = 0;
    let received = 0;
    let spent = 0;
    for (const p of data.projects) {
      const s = projectStats(data, p);
      contract += p.contract;
      received += s.received;
      spent += s.spent;
    }
    return { contract, received, spent, outstanding: Math.max(0, contract - received) };
  }, [data]);

  const open = data.projects.find((p) => p.id === openId);

  if (!data.projects.length) {
    return (
      <div className="card">
        <Empty
          icon={<FolderKanban size={22} />}
          title="Track what every project really earns"
          action={
            <button className="btn primary" onClick={() => nav.open({ type: 'project' })}>
              <Plus size={15} /> New project
            </button>
          }
        >
          Set a contract value and a delivery budget, then tag company income and expenses to it. Kosh shows margin, budget burn and what's left to
          collect.
        </Empty>
      </div>
    );
  }

  return (
    <>
      <div className="grid g-4">
        <div className="card kpi t-sky">
          <div className="stat-l">Total contracted</div>
          <div className="stat-v num">{money.compact(totals.contract)}</div>
        </div>
        <div className="card kpi t-green">
          <div className="stat-l">Collected</div>
          <div className="stat-v num up">{money.compact(totals.received)}</div>
        </div>
        <div className="card kpi t-gold">
          <div className="stat-l">Still to collect</div>
          <div className="stat-v num">{money.compact(totals.outstanding)}</div>
        </div>
        <div className="card kpi t-teal">
          <div className="stat-l">Project profit so far</div>
          <div className={`stat-v num ${totals.received - totals.spent >= 0 ? 'up' : 'down'}`}>{money.compact(totals.received - totals.spent)}</div>
          <div className="stat-d">margin {pct(totals.received ? (totals.received - totals.spent) / totals.received : null)}</div>
        </div>
      </div>

      <div className="row between mt-lg" style={{ marginBottom: 14 }}>
        <Seg
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'active', label: 'In progress' },
            { value: 'done', label: 'Done' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>

      <div className="grid g-3">
        {list.map((p) => (
          <ProjectCard key={p.id} p={p} onOpen={() => setOpenId(p.id)} />
        ))}
        <button className="card project" style={{ display: 'grid', placeItems: 'center', minHeight: 220, borderStyle: 'dashed', background: 'transparent', color: 'var(--text-3)' }} onClick={() => nav.open({ type: 'project' })}>
          <span className="row">
            <Plus size={16} /> New project
          </span>
        </button>
      </div>

      {open && <ProjectDetail p={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

function ProjectCard({ p, onOpen }: { p: Project; onOpen: () => void }) {
  const { data, money } = useVault();
  const s = projectStats(data, p);
  return (
    <div className="card project" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="project-glow" style={{ background: `linear-gradient(180deg, ${p.color}, transparent)` }} />
      <div className="project-top">
        <div style={{ minWidth: 0 }}>
          <div className="project-name">{p.name}</div>
          <div className="faint" style={{ fontSize: 12.5 }}>
            {p.client || 'No client'}
          </div>
        </div>
        <span className={`pill ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
      </div>
      <dl className="kv">
        <div>
          <dt>Received</dt>
          <dd>{money.compact(s.received)}</dd>
        </div>
        <div>
          <dt>Spent</dt>
          <dd>{money.compact(s.spent)}</dd>
        </div>
        <div>
          <dt>Margin</dt>
          <dd className={s.profit >= 0 ? 'up' : 'down'}>{pct(s.margin)}</dd>
        </div>
      </dl>
      <div className="meter-row">
        <div className="row between">
          <span>Budget used</span>
          <span className="num">{pct(s.burn)}</span>
        </div>
        <Bar value={s.burn ?? 0} color={(s.burn ?? 0) > 1 ? 'var(--expense)' : (s.burn ?? 0) > 0.85 ? 'var(--warn)' : p.color} />
      </div>
      <div className="meter-row">
        <div className="row between">
          <span>Collected</span>
          <span className="num">{pct(s.collected)}</span>
        </div>
        <Bar value={s.collected ?? 0} color="var(--income)" />
      </div>
    </div>
  );
}

function ProjectDetail({ p, onClose }: { p: Project; onClose: () => void }) {
  const { data, money } = useVault();
  const nav = useNav();
  const s = projectStats(data, p);
  const txs = data.transactions.filter((t) => t.projectId === p.id);

  const timeline = useMemo(() => {
    const months = new Map<string, { in: number; out: number }>();
    for (const t of txs) {
      const k = monthKey(t.date);
      const m = months.get(k) ?? { in: 0, out: 0 };
      t.kind === 'income' ? (m.in += t.amount) : (m.out += t.amount);
      months.set(k, m);
    }
    return [...months.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [txs]);

  return (
    <Modal
      wide
      title={
        <span className="row">
          <i className="swatch" style={{ background: p.color, width: 10, height: 10 }} />
          {p.name}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={() => (onClose(), nav.open({ type: 'project', initial: p }))}>
            <Pencil size={14} /> Edit project
          </button>
          <div className="right">
            <button className="btn" onClick={() => nav.open({ type: 'tx', defaults: { book: 'company', kind: 'expense', projectId: p.id } })}>
              Add cost
            </button>
            <button className="btn primary" onClick={() => nav.open({ type: 'tx', defaults: { book: 'company', kind: 'income', projectId: p.id } })}>
              Record payment
            </button>
          </div>
        </>
      }
    >
      <div className="grid g-4" style={{ gap: 10 }}>
        {[
          ['Contract', money.compact(p.contract)],
          ['Received', money.compact(s.received)],
          ['Spent', money.compact(s.spent)],
          ['Profit', money.compact(s.profit)],
        ].map(([l, v]) => (
          <div key={l} className="pocket">
            <div className="pocket-l">{l}</div>
            <div className="pocket-v num" style={{ fontSize: 18 }}>
              {v}
            </div>
          </div>
        ))}
      </div>
      {timeline.length > 0 && (
        <div className="mt">
          <Bars
            labels={timeline.map(([k]) => monthLabel(k, true))}
            series={[
              { name: 'Received', color: 'var(--income)', values: timeline.map(([, m]) => m.in) },
              { name: 'Spent', color: p.color, values: timeline.map(([, m]) => m.out) },
            ]}
            format={money.full}
            height={170}
          />
        </div>
      )}
      <div className="card flush mt" style={{ maxHeight: 280, overflowY: 'auto', boxShadow: 'none' }}>
        {txs.length === 0 ? (
          <p className="muted" style={{ padding: 20, margin: 0 }}>
            No entries yet. Tag company income and costs to this project to see its margin.
          </p>
        ) : (
          activityOf(txs, []).map((a) => <ActivityRow key={activityKey(a)} a={a} />)
        )}
      </div>
    </Modal>
  );
}
