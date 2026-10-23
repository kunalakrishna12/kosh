/** Which set of books an entry belongs to. */
export type Book = 'personal' | 'company';

export type TxKind = 'income' | 'expense';

/**
 * Money is always stored as an integer number of minor units (paise, cents)
 * so that sums never drift through floating point.
 */
export interface Transaction {
  id: string;
  book: Book;
  kind: TxKind;
  amount: number;
  category: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  note: string;
  /** Company entries can be tied to a client project. */
  projectId?: string;
  /**
   * A company expense you paid with your own money. It leaves your personal
   * cash, not the company's, and the company owes it back to you.
   */
  paidPersonally?: boolean;
  /** Set when this entry is a payment of a recurring bill. */
  billId?: string;
  /** GST/VAT rate in percent that is already included in `amount`. */
  taxRate?: number;
  createdAt: number;
}

export type BillFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type BillKind = 'cloud' | 'api' | 'saas' | 'rent' | 'utility' | 'payroll' | 'tax' | 'insurance' | 'loan' | 'other';

/** A recurring bill: a cloud account, an API, a subscription, rent, a CA retainer… */
export interface Bill {
  id: string;
  book: Book;
  name: string;
  vendor: string;
  kind: BillKind;
  /** Expected amount per cycle. For usage-based bills this is an estimate. */
  amount: number;
  /** Usage-based: the real amount is entered when it is paid. */
  variable: boolean;
  frequency: BillFrequency;
  /** Next date this bill is due, YYYY-MM-DD. */
  nextDue: string;
  category: string;
  projectId?: string;
  taxRate?: number;
  autopay: boolean;
  active: boolean;
  notes: string;
  createdAt: number;
}

export const BILL_KIND_LABEL: Record<BillKind, string> = {
  cloud: 'Cloud',
  api: 'API & usage',
  saas: 'Software',
  rent: 'Rent',
  utility: 'Utilities',
  payroll: 'Payroll',
  tax: 'Tax & compliance',
  insurance: 'Insurance',
  loan: 'Loan / EMI',
  other: 'Other',
};

export const FREQUENCY_LABEL: Record<BillFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export const TAX_RATES = [0, 5, 12, 18, 28];

/** Money moving between you and your company. */
export type TransferReason =
  // you → company
  | 'capital'
  | 'loan'
  // company → you
  | 'salary'
  | 'dividend'
  | 'repayment'
  | 'reimbursement';

export interface Transfer {
  id: string;
  reason: TransferReason;
  amount: number;
  date: string;
  note: string;
  createdAt: number;
}

export type ProjectStatus = 'active' | 'paused' | 'done';

export interface Project {
  id: string;
  name: string;
  client: string;
  /** Agreed value of the work (what the client pays). */
  contract: number;
  /** What you plan to spend delivering it. */
  budget: number;
  status: ProjectStatus;
  color: string;
  startDate: string;
  createdAt: number;
}

export interface Secret {
  id: string;
  book: Book;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  tags: string[];
  favorite: boolean;
  /** When the password itself last changed. */
  passwordChangedAt: number;
  history: { password: string; changedAt: number }[];
  createdAt: number;
  updatedAt: number;
}

export type ThemePref = 'system' | 'dark' | 'light';

export interface Settings {
  ownerName: string;
  companyName: string;
  currency: string;
  locale: string;
  openingBalance: Record<Book, number>;
  autoLockMinutes: number;
  /** Month the financial year starts in, 1–12 (April in India, January elsewhere). */
  fyStartMonth: number;
}

export interface VaultData {
  version: 1;
  settings: Settings;
  transactions: Transaction[];
  transfers: Transfer[];
  projects: Project[];
  secrets: Secret[];
  bills: Bill[];
}

export const TO_COMPANY: TransferReason[] = ['capital', 'loan'];
export const TO_PERSONAL: TransferReason[] = ['salary', 'dividend', 'repayment', 'reimbursement'];

export const TRANSFER_LABEL: Record<TransferReason, string> = {
  capital: 'Capital invested',
  loan: 'Loan to company',
  salary: 'Salary drawn',
  dividend: 'Dividend',
  repayment: 'Loan repaid',
  reimbursement: 'Reimbursement',
};

export const DEFAULT_CATEGORIES: Record<Book, Record<TxKind, string[]>> = {
  personal: {
    expense: ['Rent', 'Groceries', 'Dining', 'Travel', 'Utilities', 'Health', 'Insurance', 'Shopping', 'Subscriptions', 'Family', 'Education', 'Investments', 'Loan EMI', 'Other'],
    income: ['Interest', 'Freelance', 'Gift', 'Refund', 'Other'],
  },
  company: {
    expense: ['Payroll', 'Contractors', 'Software', 'Cloud', 'APIs', 'Marketing', 'Office', 'Rent', 'Utilities', 'Travel', 'Legal & Tax', 'Insurance', 'Equipment', 'Other'],
    income: ['Client payment', 'Retainer', 'Product sales', 'Grant', 'Other'],
  },
};

export const PROJECT_COLORS = ['#8b7cff', '#2dd4bf', '#f5b84b', '#fb7185', '#60a5fa', '#a3e635', '#f472b6', '#38bdf8'];

export function emptyVault(): VaultData {
  return {
    version: 1,
    settings: {
      ownerName: '',
      companyName: '',
      currency: 'INR',
      locale: 'en-IN',
      openingBalance: { personal: 0, company: 0 },
      autoLockMinutes: 5,
      fyStartMonth: 4,
    },
    transactions: [],
    transfers: [],
    projects: [],
    secrets: [],
    bills: [],
  };
}
