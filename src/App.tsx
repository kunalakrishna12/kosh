import { Lock, Menu, Moon, Plus, Search, Sun } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BillForm, GeneratorModal, ProjectForm, SecretForm, TransferForm, TxForm } from './components/forms';
import { Palette } from './components/Palette';
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
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="km" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f5d48a" />
          <stop offset="1" stopColor="#d99a2b" />
        </linearGradient>
      </defs>
      <path d="M14 10v44M14 32l22-22M22 24l20 30" stroke="url(#km)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="48" cy="12" r="5" fill="url(#km)" />
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

/** Theme is shared app-wide (lock screen, sidebar, settings) and remembered outside the vault. */
export function useTheme(): [ThemePref, (t: ThemePref) => void] {
  const [theme, set] = useState(currentTheme);
  useEffect(() => {
    themeListeners.add(set);
    return () => void themeListeners.delete(set);
  }, []);
  const setTheme = useCallback((t: ThemePref) => {
    currentTheme = t;
    prefs.set('theme', t);
    applyTheme();
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

function Shell({ theme, setTheme }: { theme: ThemePref; setTheme: (t: ThemePref) => void }) {
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
  const fileRef = useRef<HTMLInputElement>(null);
  const primary = () => {
    const p = PRIMARY[view];
    if (p.type === 'upload') fileRef.current?.click();
    else setDialog({ type: p.type } as Dialog);
  };

  return (
    <NavCtx.Provider value={nav}>
      <div className="shell">
        <aside className="side">
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
              <button className="icon-btn" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label="Toggle theme" title={`Theme: ${theme}`}>
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
            <h1>{TITLES[view]}</h1>
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
          {NAV_ITEMS.filter((n) => n.mobile).map((n) => (
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
          <div className="sheet" role="dialog" aria-label="All sections">
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
