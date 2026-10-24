/** Which set of books an entry belongs to. */
export type Book = 'personal' | 'company';

export type TxKind = 'income' | 'expense';

/**
 * Money is always stored as an integer number of minor units (paise, cents)
 * so that sums never drift through floating point.
 */
/** An amount charged in another currency, e.g. a $20 subscription paid from an Indian card. */
export interface Fx {
  currency: string;
  /** In that currency's minor units (cents). */
  amount: number;
  /** Market rate: your currency per 1 unit (₹84.12 per $1). */
  rate: number;
  /** The card's forex fee in percent, GST included (3.5% + 18% GST = 4.13%). */
  markup: number;
}

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
  /** Set when this entry is a payment against an invoice. */
  invoiceId?: string;
  /** The bank account, card or cash the money came from or went into. */
  accountId?: string;
  /** A correction from "Update balance". Moves cash but is not income or expense. */
  adjustment?: boolean;
  /** Set when this was charged in another currency; `amount` is what it cost in yours. */
  fx?: Fx;
  createdAt: number;
}

export type AccountKind = 'savings' | 'current' | 'cash' | 'card' | 'wallet' | 'deposit' | 'investment';

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  savings: 'Savings account',
  current: 'Current account',
  cash: 'Cash in hand',
  card: 'Credit card',
  wallet: 'Wallet / UPI',
  deposit: 'Fixed deposit',
  investment: 'Mutual fund / investment',
};

/** A place money lives: a bank account, cash, a card or a wallet. */
export interface Account {
  id: string;
  book: Book;
  name: string;
  kind: AccountKind;
  bank: string;
  holder: string;
  number: string;
  ifsc: string;
  branch: string;
  upi: string;
  /** Balance before the first entry recorded in Kosh. Negative for money owed on a card. */
  opening: number;
  color: string;
  archived: boolean;
  notes: string;
  createdAt: number;
}

/** Money moved between two of your own accounts in the same book, like an ATM withdrawal. */
export interface Move {
  id: string;
  from: string;
  to: string;
  amount: number;
  date: string;
  note: string;
  /** Set when this move is an instalment of a SIP. */
  sipId?: string;
  createdAt: number;
}

/** A systematic investment plan: a fixed amount moved from a bank account into an investment, every cycle. */
export interface Sip {
  id: string;
  name: string;
  fromAccountId: string;
  /** The investment account it buys into. */
  toAccountId: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'quarterly';
  nextDue: string;
  /** Auto-debit mandate set up with the bank. */
  autopay: boolean;
  active: boolean;
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
  /** Billed in another currency: `amount` is then the estimate in yours, updated after each payment. */
  fx?: Fx;
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
  fromAccountId?: string;
  toAccountId?: string;
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

/** Your company's details, printed on invoices. */
export interface CompanyProfile {
  legalName: string;
  address: string;
  /** State or region, used to decide CGST+SGST (same state) vs IGST. */
  state: string;
  taxId: string;
  email: string;
  phone: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  upi: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  paymentTermsDays: number;
  invoiceNotes: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  /** HSN / SAC code. */
  code: string;
  qty: number;
  /** Price per unit before tax, in minor units. */
  rate: number;
  taxRate: number;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';

export interface Invoice {
  id: string;
  number: string;
  clientName: string;
  clientAddress: string;
  clientTaxId: string;
  clientEmail: string;
  /** Client's state; compared with the company's to split GST. */
  placeOfSupply: string;
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  notes: string;
  projectId?: string;
  status: InvoiceStatus;
  paidDate?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Budget {
  id: string;
  book: Book;
  category: string;
  /** Monthly limit in minor units. */
  amount: number;
  createdAt: number;
}

/** "When a bank line mentions X, file it under Y." Learned during import. */
export interface Rule {
  id: string;
  book: Book;
  match: string;
  category: string;
  createdAt: number;
}

export type DocFolder = 'invoices' | 'receipts' | 'tax' | 'bank' | 'legal' | 'contracts' | 'identity' | 'insurance' | 'property' | 'other';

export const DOC_FOLDER_LABEL: Record<DocFolder, string> = {
  invoices: 'Invoices',
  receipts: 'Receipts & bills',
  tax: 'Tax & GST',
  bank: 'Bank statements',
  legal: 'Company & legal',
  contracts: 'Contracts',
  identity: 'ID & KYC',
  insurance: 'Insurance',
  property: 'Property & vehicle',
  other: 'Other',
};

/** Metadata for a stored file. The file itself is encrypted separately (see storage.ts). */
export interface Doc {
  id: string;
  book: Book;
  name: string;
  mime: string;
  size: number;
  folder: DocFolder;
  tags: string[];
  notes: string;
  /** For passports, insurance, licences, contracts… */
  expiresOn?: string;
  /** A transaction, bill or invoice this file belongs to. */
  linkId?: string;
  /** Password needed to open the file itself, like a protected bank statement or e-Aadhaar PDF. */
  password?: string;
  createdAt: number;
}

export interface Settings {
  ownerName: string;
  companyName: string;
  currency: string;
  locale: string;
  openingBalance: Record<Book, number>;
  autoLockMinutes: number;
  /** Month the financial year starts in, 1–12 (April in India, January elsewhere). */
  fyStartMonth: number;
  company: CompanyProfile;
  /** Overall monthly spending limit per book; 0 means not set. */
  monthlyBudget: Record<Book, number>;
}

export interface VaultData {
  version: 1;
  settings: Settings;
  transactions: Transaction[];
  transfers: Transfer[];
  projects: Project[];
  secrets: Secret[];
  bills: Bill[];
  invoices: Invoice[];
  budgets: Budget[];
  rules: Rule[];
  docs: Doc[];
  accounts: Account[];
  moves: Move[];
  sips: Sip[];
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
      company: emptyCompany(),
      monthlyBudget: { personal: 0, company: 0 },
    },
    transactions: [],
    transfers: [],
    projects: [],
    secrets: [],
    bills: [],
    invoices: [],
    budgets: [],
    rules: [],
    docs: [],
    accounts: [],
    moves: [],
    sips: [],
  };
}

export function emptyCompany(): CompanyProfile {
  return {
    legalName: '',
    address: '',
    state: '',
    taxId: '',
    email: '',
    phone: '',
    bankName: '',
    accountName: '',
    accountNumber: '',
    ifsc: '',
    upi: '',
    invoicePrefix: 'INV-',
    nextInvoiceNumber: 1,
    paymentTermsDays: 15,
    invoiceNotes: 'Thank you for your business.',
  };
}
