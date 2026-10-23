import { ArrowLeftRight, FileBarChart, FolderKanban, KeyRound, LayoutGrid, Receipt, Settings, Sparkles, Wallet, type LucideIcon } from 'lucide-react';
import { createContext, useContext } from 'react';
import type { Bill, Book, Project, Secret, Transaction, Transfer } from './lib/types';

export type View = 'overview' | 'money' | 'bills' | 'projects' | 'owner' | 'reports' | 'vault' | 'insights' | 'settings';

export const NAV_GROUPS = ['Money', 'Accounting', 'Security', 'App'] as const;

export const NAV_ITEMS: { view: View; label: string; icon: LucideIcon; group: (typeof NAV_GROUPS)[number]; mobile?: string }[] = [
  { view: 'overview', label: 'Overview', icon: LayoutGrid, group: 'Money', mobile: 'Home' },
  { view: 'money', label: 'Transactions', icon: Wallet, group: 'Money', mobile: 'Money' },
  { view: 'bills', label: 'Bills', icon: Receipt, group: 'Money', mobile: 'Bills' },
  { view: 'projects', label: 'Projects', icon: FolderKanban, group: 'Money' },
  { view: 'owner', label: 'You & Company', icon: ArrowLeftRight, group: 'Money' },
  { view: 'reports', label: 'Reports & tax', icon: FileBarChart, group: 'Accounting', mobile: 'Reports' },
  { view: 'insights', label: 'Insights', icon: Sparkles, group: 'Accounting' },
  { view: 'vault', label: 'Passwords', icon: KeyRound, group: 'Security', mobile: 'Vault' },
  { view: 'settings', label: 'Settings', icon: Settings, group: 'App', mobile: 'More' },
];

export type TxDefaults = Partial<Pick<Transaction, 'book' | 'kind' | 'projectId' | 'billId' | 'amount' | 'category' | 'note' | 'taxRate'>>;

export type Dialog =
  | { type: 'tx'; initial?: Transaction; defaults?: TxDefaults }
  | { type: 'bill'; initial?: Bill; defaults?: { book?: Book } }
  | { type: 'transfer'; initial?: Transfer }
  | { type: 'project'; initial?: Project }
  | { type: 'secret'; initial?: Secret; defaults?: { book?: Book } }
  | { type: 'generator' };

export interface Nav {
  view: View;
  go(view: View, opts?: { projectId?: string }): void;
  open(d: Dialog): void;
  openPalette(): void;
  /** Which project to show in detail when landing on Projects. */
  focusProject: string | null;
}

export const NavCtx = createContext<Nav | null>(null);

export function useNav(): Nav {
  const n = useContext(NavCtx);
  if (!n) throw new Error('useNav outside NavCtx');
  return n;
}
