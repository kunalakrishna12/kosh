import { addDays, today } from './dates';
import type { CompanyProfile, Invoice, InvoiceItem, Transaction } from './types';

export interface InvoiceTotals {
  subtotal: number;
  /** Same state: tax split equally into CGST + SGST. Different state (or none given): IGST. */
  split: boolean;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  total: number;
  /** Taxable value and tax per rate, used for the payment entries and the GST register. */
  byRate: { rate: number; taxable: number; tax: number }[];
}

export const lineAmount = (it: InvoiceItem) => Math.round(it.qty * it.rate);

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function totals(inv: Pick<Invoice, 'items' | 'placeOfSupply'>, company: Pick<CompanyProfile, 'state'>): InvoiceTotals {
  const rates = new Map<number, { taxable: number; tax: number }>();
  for (const it of inv.items) {
    const amount = lineAmount(it);
    const r = rates.get(it.taxRate) ?? { taxable: 0, tax: 0 };
    r.taxable += amount;
    rates.set(it.taxRate, r);
  }
  // Tax is computed per rate on the summed taxable value, as GST invoices do.
  for (const [rate, r] of rates) r.tax = Math.round((r.taxable * rate) / 100);
  const byRate = [...rates.entries()].map(([rate, r]) => ({ rate, ...r })).sort((a, b) => a.rate - b.rate);
  const subtotal = byRate.reduce((s, r) => s + r.taxable, 0);
  const tax = byRate.reduce((s, r) => s + r.tax, 0);
  const split = !!company.state && !!inv.placeOfSupply && norm(company.state) === norm(inv.placeOfSupply);
  const cgst = split ? Math.floor(tax / 2) : 0;
  return { subtotal, split, cgst, sgst: split ? tax - cgst : 0, igst: split ? 0 : tax, tax, total: subtotal + tax, byRate };
}

export type InvoiceState = 'draft' | 'due' | 'overdue' | 'paid' | 'void';

export function invoiceState(inv: Invoice, t = today()): InvoiceState {
  if (inv.status === 'draft' || inv.status === 'paid' || inv.status === 'void') return inv.status;
  return inv.dueDate < t ? 'overdue' : 'due';
}

export function formatNumber(c: Pick<CompanyProfile, 'invoicePrefix' | 'nextInvoiceNumber'>) {
  return `${c.invoicePrefix}${String(c.nextInvoiceNumber).padStart(4, '0')}`;
}

export function newInvoice(c: CompanyProfile, id: string): Invoice {
  const t = today();
  const now = Date.now();
  return {
    id,
    number: formatNumber(c),
    clientName: '',
    clientAddress: '',
    clientTaxId: '',
    clientEmail: '',
    placeOfSupply: c.state,
    issueDate: t,
    dueDate: addDays(t, c.paymentTermsDays),
    items: [{ id: `${id}-1`, description: '', code: '', qty: 1, rate: 0, taxRate: 18 }],
    notes: c.invoiceNotes,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

/** One income entry per tax rate, so the GST summary stays exact. */
export function paymentEntries(inv: Invoice, company: Pick<CompanyProfile, 'state'>, date: string, ids: () => string, accountId?: string): Transaction[] {
  const tt = totals(inv, company);
  const label = `${inv.number} · ${inv.clientName || 'Client'}`;
  return tt.byRate
    .filter((r) => r.taxable + r.tax > 0)
    .map((r) => ({
      id: ids(),
      book: 'company',
      kind: 'income',
      amount: r.taxable + r.tax,
      category: 'Client payment',
      date,
      note: label,
      invoiceId: inv.id,
      ...(inv.projectId ? { projectId: inv.projectId } : {}),
      ...(r.rate ? { taxRate: r.rate } : {}),
      ...(accountId ? { accountId } : {}),
      createdAt: Date.now(),
    }));
}

/* Amount in words, as printed on Indian invoices ("Rupees One Lakh Eighteen Thousand Only"). */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ''}`;
  return [h ? `${ONES[h]} Hundred` : '', rest].filter(Boolean).join(' ');
}

function words(n: number, indian: boolean): string {
  if (n === 0) return 'Zero';
  const scales: [number, string][] = indian
    ? [
        [1e7, 'Crore'],
        [1e5, 'Lakh'],
        [1e3, 'Thousand'],
      ]
    : [
        [1e9, 'Billion'],
        [1e6, 'Million'],
        [1e3, 'Thousand'],
      ];
  const parts: string[] = [];
  for (const [size, name] of scales) {
    if (n >= size) {
      const q = Math.floor(n / size);
      parts.push(`${q >= 1000 ? words(q, indian) : belowThousand(q)} ${name}`);
      n %= size;
    }
  }
  if (n) parts.push(belowThousand(n));
  return parts.join(' ');
}

export function amountInWords(minor: number, currency: string): string {
  const major = Math.floor(minor / 100);
  const cents = minor % 100;
  const indian = currency === 'INR';
  const unit = { INR: ['Rupees', 'Paise'], USD: ['Dollars', 'Cents'], EUR: ['Euros', 'Cents'], GBP: ['Pounds', 'Pence'] }[currency] ?? [currency, 'Cents'];
  return `${unit[0]} ${words(major, indian)}${cents ? ` and ${words(cents, indian)} ${unit[1]}` : ''} Only`;
}

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry', 'Outside India',
];
