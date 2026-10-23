import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Briefcase, Dices, FolderKanban, KeyRound, Lock, Receipt, Search, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hostOf } from '../lib/passwords';
import { NAV_ITEMS, useNav } from '../nav';
import { useVault } from '../store';
import { useCopy } from './ui';

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
  keywords?: string;
}

export function Palette({ onClose }: { onClose: () => void }) {
  const { data, lock } = useVault();
  const nav = useNav();
  const copy = useCopy();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const act = (fn: () => void) => () => {
      onClose();
      fn();
    };
    const base: Item[] = [
      { id: 'new-exp-p', group: 'Create', label: 'Personal expense', icon: ArrowUpRight, run: act(() => nav.open({ type: 'tx', defaults: { book: 'personal', kind: 'expense' } })), keywords: 'add spend' },
      { id: 'new-exp-c', group: 'Create', label: 'Company expense', icon: Briefcase, run: act(() => nav.open({ type: 'tx', defaults: { book: 'company', kind: 'expense' } })), keywords: 'add spend bill' },
      { id: 'new-inc', group: 'Create', label: 'Income', icon: ArrowDownLeft, run: act(() => nav.open({ type: 'tx', defaults: { book: 'company', kind: 'income' } })), keywords: 'add payment invoice' },
      { id: 'new-tr', group: 'Create', label: 'Move money between you and the company', icon: ArrowLeftRight, run: act(() => nav.open({ type: 'transfer' })), keywords: 'salary loan capital transfer' },
      { id: 'new-bill', group: 'Create', label: 'Recurring bill', icon: Receipt, run: act(() => nav.open({ type: 'bill' })), keywords: 'subscription aws cloud api rent' },
      { id: 'new-pr', group: 'Create', label: 'Project', icon: FolderKanban, run: act(() => nav.open({ type: 'project' })), keywords: 'client' },
      { id: 'new-sec', group: 'Create', label: 'Login', icon: KeyRound, run: act(() => nav.open({ type: 'secret' })), keywords: 'password' },
      { id: 'gen', group: 'Create', label: 'Generate a password', icon: Dices, run: act(() => nav.open({ type: 'generator' })) },
      ...NAV_ITEMS.map((n) => ({ id: `go-${n.view}`, group: 'Go to', label: n.label, icon: n.icon, run: act(() => nav.go(n.view)) })),
      { id: 'lock', group: 'Go to', label: 'Lock vault', hint: '⌘⇧L', icon: Lock, run: act(lock) },
    ];
    if (!q.trim()) return base;
    const term = q.toLowerCase();
    const secrets: Item[] = data.secrets
      .filter((s) => `${s.title} ${s.username} ${s.url} ${s.tags.join(' ')}`.toLowerCase().includes(term))
      .slice(0, 6)
      .map((s) => ({
        id: `sec-${s.id}`,
        group: 'Copy password',
        label: s.title,
        hint: s.username || hostOf(s.url),
        icon: KeyRound,
        run: act(() => copy(s.password, `${s.title} password`, true)),
      }));
    const projects: Item[] = data.projects
      .filter((p) => `${p.name} ${p.client}`.toLowerCase().includes(term))
      .slice(0, 4)
      .map((p) => ({ id: `pr-${p.id}`, group: 'Projects', label: p.name, hint: p.client, icon: FolderKanban, run: act(() => nav.go('projects', { projectId: p.id })) }));
    const bills: Item[] = data.bills
      .filter((b) => b.active && `${b.name} ${b.vendor}`.toLowerCase().includes(term))
      .slice(0, 4)
      .map((b) => ({
        id: `bill-${b.id}`,
        group: 'Pay a bill',
        label: `Pay ${b.name}`,
        hint: b.vendor,
        icon: Receipt,
        run: act(() =>
          nav.open({ type: 'tx', defaults: { book: b.book, kind: 'expense', amount: b.amount, category: b.category, note: b.name, billId: b.id, projectId: b.projectId, taxRate: b.taxRate } }),
        ),
      }));
    const matches = base.filter((i) => `${i.label} ${i.keywords ?? ''}`.toLowerCase().includes(term));
    return [...secrets, ...bills, ...projects, ...matches];
  }, [q, data.secrets, data.projects, data.bills, nav, lock, copy, onClose]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(items.length - 1, s + 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
    else if (e.key === 'Enter') items[sel]?.run();
    else if (e.key === 'Escape') onClose();
  };

  let lastGroup = '';
  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <div className="palette-in">
          <Search size={18} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search logins, projects, or type a command…"
            aria-label="Command"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {items.length === 0 && <div className="empty">Nothing matches “{q}”.</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? <div className="palette-group">{it.group}</div> : null;
            lastGroup = it.group;
            const Icon = it.icon;
            return (
              <div key={it.id}>
                {header}
                <button className="palette-item" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={it.run}>
                  <Icon size={16} />
                  {it.label}
                  {it.hint && <span className="hint">{it.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
