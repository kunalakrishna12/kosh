import { ArrowLeftRight, FileBarChart, Landmark, FileText, FolderKanban, FolderLock, Gauge, KeyRound, LayoutGrid, Receipt, Settings, Sparkles, Wallet, type LucideIcon } from 'lucide-react';
import { createContext, useContext } from 'react';
import type { Account, Bill, Book, Budget, DocFolder, Invoice, Move, Project, Secret, Transaction, Transfer } from './lib/types';

export type View = 'overview' | 'money' | 'accounts' | 'bills' | 'invoices' | 'projects' | 'owner' | 'budgets' | 'reports' | 'insights' | 'vault' | 'documents' | 'settings';

export const NAV_GROUPS = ['Money', 'Planning', 'Vault', 'App'] as const;

export const NAV_ITEMS: { view: View; label: string; icon: LucideIcon; group: (typeof NAV_GROUPS)[number]; mobile?: string }[] = [
  { view: 'overview', label: 'Overview', icon: LayoutGrid, group: 'Money', mobile: 'Home' },
  { view: 'money', label: 'Transactions', icon: Wallet, group: 'Money', mobile: 'Money' },
  { view: 'accounts', label: 'Accounts & cash', icon: Landmark, group: 'Money', mobile: 'Accounts' },
  { view: 'bills', label: 'Bills', icon: Receipt, group: 'Money', mobile: 'Bills' },
  { view: 'invoices', label: 'Invoices', icon: FileText, group: 'Money' },
  { view: 'projects', label: 'Projects', icon: FolderKanban, group: 'Money' },
  { view: 'owner', label: 'You & Company', icon: ArrowLeftRight, group: 'Money' },
  { view: 'budgets', label: 'Budgets', icon: Gauge, group: 'Planning' },
  { view: 'reports', label: 'Reports & tax', icon: FileBarChart, group: 'Planning' },
  { view: 'insights', label: 'Insights', icon: Sparkles, group: 'Planning' },
  { view: 'vault', label: 'Passwords', icon: KeyRound, group: 'Vault' },
  { view: 'documents', label: 'Documents', icon: FolderLock, group: 'Vault' },
  { view: 'settings', label: 'Settings', icon: Settings, group: 'App' },
];

export type TxDefaults = Partial<Pick<Transaction, 'book' | 'kind' | 'projectId' | 'billId' | 'amount' | 'category' | 'note' | 'taxRate' | 'accountId'>>;

export type Dialog =
  | { type: 'tx'; initial?: Transaction; defaults?: TxDefaults }
  | { type: 'bill'; initial?: Bill; defaults?: { book?: Book } }
  | { type: 'transfer'; initial?: Transfer }
  | { type: 'project'; initial?: Project }
  | { type: 'secret'; initial?: Secret; defaults?: { book?: Book } }
  | { type: 'generator' }
  | { type: 'invoice'; initial?: Invoice }
  | { type: 'budget'; initial?: Budget }
  | { type: 'import' }
  | { type: 'account'; initial?: Account; defaults?: { book?: Book } }
  | { type: 'move'; initial?: Move; defaults?: { from?: string; to?: string } }
  | { type: 'upload'; files: File[]; defaults?: { folder?: DocFolder; book?: Book; linkId?: string } };

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
