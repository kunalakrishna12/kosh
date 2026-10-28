import { Lock, Menu, Moon, Plus, Search, Sun } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BillForm, GeneratorModal, ProjectForm, SecretForm, TransferForm, TxForm } from './components/forms';
import { SlidingPill, SplitTitle } from './components/motion';
import { Palette } from './components/Palette';
import { canAnimate, enterPage, reducedMotion, rise, slideIn } from './lib/motion';
import { addDays, today } from './lib/dates';
import { prefs } from './lib/storage';
import type { ThemePref } from './lib/types';
import { NAV_GROUPS, NAV_ITEMS, NavCtx, type Dialog, type Nav, type View } from './nav';
import { useVault } from './store';
import { AccountForm, Accounts, MoveForm, SipForm } from './views/Accounts';
import { Bills } from './views/Bills';
import { PayrollRun, StaffForm, StaffView } from './views/Staff';
import { BudgetForm, Budgets } from './views/Budgets';
import { Documents, UploadForm } from './views/Documents';
import { ImportForm } from './views/Import';
import { InvoiceForm, Invoices } from './views/Invoices';
import { Insights } from './views/Insights';
import { LockScreen } from './views/Lock';
import { Money } from './views/Money';
import { Overview } from './views/Overview';
import { Owner } from './views/Owner';
import { Projects } from './views/Projects';
import { Reports } from './views/Reports';
import { SettingsView } from './views/Settings';
import { Vault } from './views/Vault';

export function BrandMark({ size = 18 }: { size?: number }) {
  // Each mark needs its own gradient id: if it shared one with a hidden copy, it would render blank.
  const id = `km${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f5d48a" />
          <stop offset="1" stopColor="#d99a2b" />
        </linearGradient>
      </defs>
      <path d="M14 10v44M14 32l22-22M22 24l20 30" stroke={`url(#${id})`} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="48" cy="12" r="5" fill={`url(#${id})`} />
    </svg>
  );
}

let currentTheme: ThemePref = (prefs.get('theme') as ThemePref) || 'system';
const themeListeners = new Set<(t: ThemePref) => void>();

export function isDark(t: ThemePref) {
  return t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function applyTheme() {
  const dark = isDark(currentTheme);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#08090b' : '#f4f3ef');
}
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/** Switch theme with the new colours spreading out in a circle from the button that was pressed. */
function revealTheme(change: () => void, from?: HTMLElement) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  if (!doc.startViewTransition || reducedMotion()) return change();
  const r = from?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : innerWidth - 40;
  const y = r ? r.top + r.height / 2 : 40;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  doc
    .startViewTransition(change)
    .ready.then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 500, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
      ),
    )
    .catch(() => {});
}

/** Theme is shared app-wide (lock screen, sidebar, settings) and remembered outside the vault. */
export function useTheme(): [ThemePref, (t: ThemePref, from?: HTMLElement) => void] {
  const [theme, set] = useState(currentTheme);
  useEffect(() => {
    themeListeners.add(set);
    return () => void themeListeners.delete(set);
  }, []);
  const setTheme = useCallback((t: ThemePref, from?: HTMLElement) => {
    currentTheme = t;
    prefs.set('theme', t);
    revealTheme(applyTheme, from);
    themeListeners.forEach((l) => l(t));
  }, []);
  return [theme, setTheme];
}

/** What the "+" button in the top bar creates on each screen. */
const PRIMARY: Record<View, { type: 'tx' | 'bill' | 'project' | 'transfer' | 'secret' | 'invoice' | 'budget' | 'upload' | 'account' | 'staff'; label: string }> = {
  overview: { type: 'tx', label: 'Entry' },
  money: { type: 'tx', label: 'Entry' },
  accounts: { type: 'account', label: 'Account' },
  bills: { type: 'bill', label: 'Bill' },
  invoices: { type: 'invoice', label: 'Invoice' },
  staff: { type: 'staff', label: 'Person' },
  budgets: { type: 'budget', label: 'Budget' },
  documents: { type: 'upload', label: 'Upload' },
  projects: { type: 'project', label: 'Project' },
  owner: { type: 'transfer', label: 'Transfer' },
  reports: { type: 'tx', label: 'Entry' },
  vault: { type: 'secret', label: 'Login' },
  insights: { type: 'tx', label: 'Entry' },
  settings: { type: 'tx', label: 'Entry' },
};

const TITLES: Record<View, string> = {
  overview: 'Overview',
  money: 'Transactions',
  accounts: 'Accounts & cash',
  bills: 'Bills',
  invoices: 'Invoices',
  staff: 'Staff & payroll',
  budgets: 'Budgets',
  documents: 'Documents',
  projects: 'Projects',
  reports: 'Reports & tax',
  owner: 'You & Company',
  vault: 'Passwords',
  insights: 'Insights',
  settings: 'Settings',
};

export default function App() {
  const vault = useVault();
  const [theme, setTheme] = useTheme();

  if (vault.status === 'loading') return null;
  if (vault.status !== 'open') return <LockScreen theme={theme} setTheme={setTheme} />;
  return <Shell theme={theme} setTheme={setTheme} />;
}

function Shell({ theme, setTheme }: { theme: ThemePref; setTheme: (t: ThemePref, from?: HTMLElement) => void }) {
  const { data, lock, demo, saveState } = useVault();
  const [view, setView] = useState<View>(() => (location.hash.slice(1) as View) in TITLES ? (location.hash.slice(1) as View) : 'overview');
  const [focusProject, setFocusProject] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [palette, setPalette] = useState(false);

  const go = useCallback((v: View, opts?: { projectId?: string }) => {
    setView(v);
    setFocusProject(opts?.projectId ?? null);
    history.replaceState(null, '', `#${v}`);
    document.querySelector('.main')?.scrollTo({ top: 0 });
  }, []);
  const nav = useMemo<Nav>(() => ({ view, go, open: setDialog, openPalette: () => setPalette(true), focusProject }), [view, go, focusProject]);

  // Keyboard: ⌘K palette, ⌘⇧L lock, N new entry.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        lock();
      } else if (e.key === 'n' && !mod && !(e.target as HTMLElement).closest('input, textarea, select, [role=dialog]')) {
        e.preventDefault();
        setDialog({ type: 'tx' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lock]);

  // Auto-lock after inactivity.
  useEffect(() => {
    const minutes = data.settings.autoLockMinutes;
    if (!minutes || demo) return;
    let t = window.setTimeout(lock, minutes * 60_000);
    const reset = () => {
      window.clearTimeout(t);
      t = window.setTimeout(lock, minutes * 60_000);
    };
    const events = ['pointerdown', 'keydown', 'pointermove', 'wheel'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [data.settings.autoLockMinutes, demo, lock]);

  const dueBills = data.bills.filter((b) => b.active && b.nextDue <= addDays(today(), 7)).length;
  const counts: Partial<Record<View, number>> = { vault: data.secrets.length, projects: data.projects.filter((p) => p.status === 'active').length, bills: dueBills };
  const dark = isDark(theme);
  const close = () => setDialog(null);

  const Page = {
    overview: Overview,
    money: Money,
    accounts: Accounts,
    bills: Bills,
    invoices: Invoices,
    staff: StaffView,
    projects: Projects,
    owner: Owner,
    budgets: Budgets,
    reports: Reports,
    insights: Insights,
    vault: Vault,
    documents: Documents,
    settings: SettingsView,
  }[view];
  const [more, setMore] = useState(false);
  const sideRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // Each new page: cards rise in a wave, rows follow, big numbers count up.
  useLayoutEffect(() => enterPage(document.querySelector<HTMLElement>('.page')), [view]);
  // The sidebar slides in once, when the vault opens.
  useLayoutEffect(() => {
    slideIn(Array.from(sideRef.current?.querySelectorAll('.brand, .nav-label, .nav-item, .side-foot') ?? []));
    const pill = sideRef.current?.querySelector('.nav-pill');
    if (canAnimate(pill)) pill.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 150, fill: 'backwards' });
  }, []);
  useLayoutEffect(() => {
    if (more) rise(Array.from(sheetRef.current?.children ?? []), { y: 14, scale: 1, stagger: 0.02, duration: 0.5 });
  }, [more]);
  const fileRef = useRef<HTMLInputElement>(null);
  const primary = () => {
    const p = PRIMARY[view];
    if (p.type === 'upload') fileRef.current?.click();
    else setDialog({ type: p.type } as Dialog);
  };

  return (
    <NavCtx.Provider value={nav}>
      <div className="shell">
        <aside className="side" ref={sideRef}>
          <SlidingPill selector=".nav-item[aria-current='page']" watch={view} className="nav-pill" />
          <div className="brand">
            <span className="brand-mark">
              <BrandMark />
            </span>
            Kosh
          </div>
          {NAV_GROUPS.map((g) => (
            <div key={g}>
              {g !== 'App' && <div className="nav-label">{g}</div>}
              {g === 'App' && <div style={{ height: 14 }} />}
              {NAV_ITEMS.filter((n) => n.group === g).map((n) => (
                <button key={n.view} className="nav-item" aria-current={view === n.view ? 'page' : undefined} onClick={() => go(n.view)}>
                  <n.icon size={17} />
                  {n.label}
                  {counts[n.view] ? <span className={`count num ${n.view === 'bills' ? 'due' : ''}`}>{counts[n.view]}</span> : null}
                </button>
              ))}
            </div>
          ))}
          <div className="side-foot">
            <div className="seal" title="Everything is encrypted on this device with AES-256-GCM.">
              <span className={`dot ${demo ? 'saving' : saveState}`} />
              {demo ? 'Demo · nothing is saved' : saveState === 'saving' ? 'Encrypting…' : saveState === 'error' ? 'Could not save' : 'Encrypted · saved on this device'}
            </div>
            <div className="row">
              <button className="btn ghost sm" style={{ flex: 1 }} onClick={lock}>
                <Lock size={14} /> Lock
              </button>
              <button className="icon-btn" onClick={(e) => setTheme(dark ? 'light' : 'dark', e.currentTarget)} aria-label="Toggle theme" title={`Theme: ${theme}`}>
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>
          </div>
        </aside>

        <main className="main">
          {demo && (
            <div className="demo-bar">
              You're exploring sample data. Nothing you do here is saved.
              <button onClick={lock}>Leave demo</button>
            </div>
          )}
          <header className="top">
            <span className="brand-mark top-mark" aria-hidden>
              <BrandMark size={17} />
            </span>
            <h1 key={view} aria-label={TITLES[view]}>
              <SplitTitle text={TITLES[view]} />
            </h1>
            <div className="grow" />
            <button className="search-btn" onClick={() => setPalette(true)} aria-label="Search and commands">
              <Search size={15} />
              <span className="label">Search or jump to…</span>
              <kbd>⌘K</kbd>
            </button>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => (e.target.files?.length && setDialog({ type: 'upload', files: [...e.target.files] }), (e.target.value = ''))} />
            <button className="btn primary" onClick={primary}>
              <Plus size={16} />
              <span className="label">{PRIMARY[view].label}</span>
            </button>
          </header>
          <div className="page" key={view}>
            <Page />
          </div>
        </main>

        <nav className="mobile-nav" aria-label="Sections">
          <SlidingPill selector="button[aria-current='page']" watch={`${view}${more}`} className="tab-pill" />
          {NAV_ITEMS.filter((n) => n.mobile)
            .slice(0, 2)
            .map((n) => (
              <button key={n.view} aria-current={view === n.view ? 'page' : undefined} onClick={() => go(n.view)}>
                <n.icon size={20} />
                {n.mobile}
              </button>
            ))}
          <button className="mobile-add" onClick={primary} aria-label={`New ${PRIMARY[view].label.toLowerCase()}`}>
            <Plus size={22} />
          </button>
          {NAV_ITEMS.filter((n) => n.mobile)
            .slice(2)
            .map((n) => (
              <button key={n.view} aria-current={view === n.view ? 'page' : undefined} onClick={() => go(n.view)}>
                <n.icon size={20} />
                {n.mobile}
              </button>
            ))}
          <button aria-current={NAV_ITEMS.some((n) => !n.mobile && n.view === view) ? 'page' : undefined} onClick={() => setMore(true)}>
            <Menu size={20} />
            More
          </button>
        </nav>
      </div>

      {dialog?.type === 'tx' && <TxForm initial={dialog.initial} defaults={dialog.defaults} onClose={close} />}
      {dialog?.type === 'invoice' && <InvoiceForm initial={dialog.initial} onClose={close} />}
      {dialog?.type === 'budget' && <BudgetForm initial={dialog.initial} defaults={dialog.defaults} onClose={close} />}
      {dialog?.type === 'import' && <ImportForm onClose={close} />}
      {dialog?.type === 'account' && <AccountForm initial={dialog.initial} defaults={dialog.defaults} onClose={close} />}
      {dialog?.type === 'staff' && <StaffForm initial={dialog.initial} onClose={close} />}
      {dialog?.type === 'payroll' && <PayrollRun month={dialog.month} onClose={close} />}
      {dialog?.type === 'sip' && <SipForm initial={dialog.initial} onClose={close} />}
      {dialog?.type === 'move' && <MoveForm initial={dialog.initial} defaults={dialog.defaults} onClose={close} />}
      {dialog?.type === 'upload' && <UploadForm files={dialog.files} defaults={dialog.defaults} onClose={close} />}
      {more && (
        <div className="scrim sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && setMore(false)}>
          <div className="sheet" role="dialog" aria-label="All sections" ref={sheetRef}>
            {NAV_ITEMS.map((n) => (
              <button key={n.view} aria-current={view === n.view ? 'page' : undefined} onClick={() => (setMore(false), go(n.view))}>
                <n.icon size={20} />
                {n.label}
              </button>
            ))}
            <button onClick={() => (setMore(false), lock())}>
              <Lock size={20} />
              Lock
            </button>
          </div>
        </div>
      )}
      {dialog?.type === 'bill' && <BillForm initial={dialog.initial} defaults={dialog.defaults} onClose={close} />}
      {dialog?.type === 'transfer' && <TransferForm initial={dialog.initial} onClose={close} />}
      {dialog?.type === 'project' && <ProjectForm initial={dialog.initial} onClose={close} />}
      {dialog?.type === 'secret' && <SecretForm initial={dialog.initial} defaults={dialog.defaults} onClose={close} />}
      {dialog?.type === 'generator' && <GeneratorModal onClose={close} />}
      {palette && <Palette onClose={() => setPalette(false)} />}
    </NavCtx.Provider>
  );
}
