import { Check, Copy, FileText, Pencil, Plus, Printer, Send, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Empty, Field, Modal, Seg, useToast } from '../components/ui';
import { addDays, dayLabel, parseDate, today } from '../lib/dates';
import { amountInWords, formatNumber, INDIAN_STATES, invoiceState, lineAmount, newInvoice, paymentEntries, totals, type InvoiceState } from '../lib/invoices';
import { toInput, toMinor } from '../lib/money';
import { periods } from '../lib/reports';
import { TAX_RATES, type Invoice, type InvoiceItem } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';

const STATE_PILL: Record<InvoiceState, [string, string]> = {
  draft: ['Draft', ''],
  due: ['Unpaid', 'warn'],
  overdue: ['Overdue', 'bad'],
  paid: ['Paid', 'good'],
  void: ['Void', ''],
};

type Filter = 'all' | 'unpaid' | 'overdue' | 'paid' | 'draft';

export function Invoices() {
  const { data, money } = useVault();
  const nav = useNav();
  const [filter, setFilter] = useState<Filter>('all');
  const [viewing, setViewing] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const t = today();
  const company = data.settings.company;

  const rows = useMemo(
    () =>
      data.invoices
        .map((inv) => ({ inv, state: invoiceState(inv, t), tt: totals(inv, company) }))
        .sort((a, b) => (a.inv.issueDate === b.inv.issueDate ? b.inv.number.localeCompare(a.inv.number) : a.inv.issueDate < b.inv.issueDate ? 1 : -1)),
    [data.invoices, company, t],
  );

  const stats = useMemo(() => {
    const fy = periods(data.settings.fyStartMonth, t).find((p) => p.id === 'this-fy')!;
    let outstanding = 0;
    let overdue = 0;
    let overdueCount = 0;
    let paidFy = 0;
    const daysToPay: number[] = [];
    for (const { inv, state, tt } of rows) {
      if (state === 'due' || state === 'overdue') outstanding += tt.total;
      if (state === 'overdue') (overdue += tt.total), overdueCount++;
      if (state === 'paid' && inv.paidDate) {
        if (inv.paidDate >= fy.from) paidFy += tt.total;
        daysToPay.push((parseDate(inv.paidDate).getTime() - parseDate(inv.issueDate).getTime()) / 86_400_000);
      }
    }
    const avgDays = daysToPay.length ? Math.round(daysToPay.reduce((a, b) => a + b, 0) / daysToPay.length) : null;
    return { outstanding, overdue, overdueCount, paidFy, avgDays, fyLabel: fy.label.replace(' to date', '') };
  }, [rows, data.settings.fyStartMonth, t]);

  const list = rows.filter(({ state }) =>
    filter === 'all' ? true : filter === 'unpaid' ? state === 'due' || state === 'overdue' : filter === 'overdue' ? state === 'overdue' : state === filter,
  );

  const viewingInv = data.invoices.find((i) => i.id === viewing);
  const payingInv = data.invoices.find((i) => i.id === paying);

  if (!data.invoices.length) {
    return (
      <div className="card">
        <Empty
          icon={<FileText size={22} />}
          title="Send GST-ready invoices in a minute"
          action={
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => nav.open({ type: 'invoice' })}>
                <Plus size={15} /> New invoice
              </button>
              {!company.legalName && (
                <button className="btn" onClick={() => nav.go('settings')}>
                  Add company details
                </button>
              )}
            </div>
          }
        >
          Line items with HSN/SAC codes, CGST + SGST or IGST worked out automatically, amount in words, and your bank and UPI details. Print or save as
          PDF, then mark it paid and the income lands in your books with the right GST.
        </Empty>
      </div>
    );
  }

  return (
    <>
      {!company.legalName && (
        <div className="card row between wrap" style={{ marginBottom: 16, borderColor: 'color-mix(in srgb, var(--gold) 40%, transparent)' }}>
          <span className="muted">Add your company name, GSTIN, address and bank details so they print on every invoice.</span>
          <button className="btn sm" onClick={() => nav.go('settings')}>
            Company details
          </button>
        </div>
      )}
      <div className="grid g-4">
        <div className="card">
          <div className="stat-l">Waiting to be paid</div>
          <div className="stat-v num">{money.compact(stats.outstanding)}</div>
          <div className="stat-d">across {rows.filter((r) => r.state === 'due' || r.state === 'overdue').length} invoices</div>
        </div>
        <div className="card" style={{ borderColor: stats.overdueCount ? 'color-mix(in srgb, var(--expense) 40%, transparent)' : undefined }}>
          <div className="stat-l">Overdue</div>
          <div className={`stat-v num ${stats.overdueCount ? 'down' : ''}`}>{stats.overdueCount ? money.compact(stats.overdue) : 'None'}</div>
          <div className="stat-d">{stats.overdueCount ? `${stats.overdueCount} to chase` : 'Everyone has paid on time'}</div>
        </div>
        <div className="card">
          <div className="stat-l">Paid in {stats.fyLabel}</div>
          <div className="stat-v num up">{money.compact(stats.paidFy)}</div>
          <div className="stat-d">through invoices</div>
        </div>
        <div className="card">
          <div className="stat-l">Average time to get paid</div>
          <div className="stat-v num">{stats.avgDays === null ? '—' : `${stats.avgDays} days`}</div>
          <div className="stat-d">from invoice date</div>
        </div>
      </div>

      <div className="row between wrap mt-lg" style={{ marginBottom: 14 }}>
        <Seg
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unpaid', label: 'Unpaid' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'paid', label: 'Paid' },
            { value: 'draft', label: 'Drafts' },
          ]}
        />
      </div>

      <div className="card flush">
        {list.length === 0 && <Empty icon={<FileText size={22} />} title="No invoices here" />}
        {list.map(({ inv, state, tt }) => (
          <div key={inv.id} className="tx" style={{ gridTemplateColumns: '36px minmax(0,1.3fr) minmax(0,1fr) auto auto' }} onClick={() => setViewing(inv.id)}>
            <div className="tx-ico company">
              <FileText size={16} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="tx-t">{inv.clientName || 'No client yet'}</div>
              <div className="tx-s">
                <span className="mono">{inv.number}</span> · {dayLabel(inv.issueDate)}
              </div>
            </div>
            <div className="tx-meta" style={{ flexDirection: 'column', gap: 2, fontSize: 12.5 }}>
              <span className={`pill ${STATE_PILL[state][1]}`} style={{ alignSelf: 'flex-start' }}>
                {STATE_PILL[state][0]}
              </span>
              <span className="faint">
                {state === 'paid' && inv.paidDate ? `paid ${dayLabel(inv.paidDate)}` : state === 'draft' || state === 'void' ? '' : `due ${dayLabel(inv.dueDate)}`}
              </span>
            </div>
            <div className="tx-a num">{money.full(tt.total)}</div>
            <div className="row" style={{ gap: 2 }} onClick={(e) => e.stopPropagation()}>
              {(state === 'due' || state === 'overdue') && (
                <button className="icon-btn" onClick={() => setPaying(inv.id)} aria-label="Mark paid" title="Mark paid">
                  <Check size={16} />
                </button>
              )}
              <button className="icon-btn" onClick={() => nav.open({ type: 'invoice', initial: inv })} aria-label="Edit invoice" title="Edit">
                <Pencil size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {viewingInv && <InvoiceView inv={viewingInv} onClose={() => setViewing(null)} onPay={() => (setViewing(null), setPaying(viewingInv.id))} />}
      {payingInv && <MarkPaid inv={payingInv} onClose={() => setPaying(null)} />}
    </>
  );
}

/* ───────── Mark paid ───────── */

function MarkPaid({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const { data, update, money } = useVault();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const tt = totals(inv, data.settings.company);
  const submit = () => {
    const entries = paymentEntries(inv, data.settings.company, date, () => crypto.randomUUID());
    update((d) => ({
      ...d,
      transactions: [...entries, ...d.transactions],
      invoices: d.invoices.map((x) => (x.id === inv.id ? { ...x, status: 'paid', paidDate: date, updatedAt: Date.now() } : x)),
    }));
    toast(`${inv.number} marked paid`);
    onClose();
  };
  return (
    <Modal
      title={`Payment for ${inv.number}`}
      onClose={onClose}
      footer={
        <div className="right">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            <Check size={15} /> Record {money.full(tt.total)}
          </button>
        </div>
      }
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          This adds {money.full(tt.total)} from {inv.clientName || 'the client'} to company income
          {tt.tax ? `, including ${money.full(tt.tax)} GST for your tax summary` : ''}.
        </p>
        <Field label="Received on">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}

/* ───────── Printable invoice ───────── */

export function InvoiceView({ inv, onClose, onPay }: { inv: Invoice; onClose: () => void; onPay?: () => void }) {
  const { data, update, money } = useVault();
  const nav = useNav();
  const toast = useToast();
  const c = data.settings.company;
  const tt = totals(inv, c);
  const state = invoiceState(inv);

  const print = () => {
    document.documentElement.classList.add('print-invoice');
    const done = () => {
      document.documentElement.classList.remove('print-invoice');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  };

  const copyReminder = async () => {
    const text = `Hi ${inv.clientName},\n\nA friendly reminder that invoice ${inv.number} for ${money.full(tt.total)} was due on ${dayLabel(inv.dueDate)}.${
      c.upi ? ` You can pay by UPI to ${c.upi}` : ''
    }${c.accountNumber ? `${c.upi ? ' or' : ' You can pay'} by bank transfer to ${c.accountName || c.legalName}, A/c ${c.accountNumber}, IFSC ${c.ifsc}` : ''}.\n\nThank you,\n${c.legalName || data.settings.companyName}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('Reminder copied');
    } catch {
      toast('Copy blocked by the browser');
    }
  };

  return (
    <Modal
      wide
      title={inv.number}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={() => (onClose(), nav.open({ type: 'invoice', initial: inv }))}>
            <Pencil size={14} /> Edit
          </button>
          <div className="right">
            {state === 'overdue' && (
              <button className="btn" onClick={copyReminder}>
                <Copy size={15} /> Copy reminder
              </button>
            )}
            {state === 'draft' && (
              <button
                className="btn"
                onClick={() => {
                  update((d) => ({ ...d, invoices: d.invoices.map((x) => (x.id === inv.id ? { ...x, status: 'sent', updatedAt: Date.now() } : x)) }));
                  toast('Marked as sent');
                }}
              >
                <Send size={15} /> Mark sent
              </button>
            )}
            {(state === 'due' || state === 'overdue') && onPay && (
              <button className="btn" onClick={onPay}>
                <Check size={15} /> Mark paid
              </button>
            )}
            <button className="btn primary" onClick={print}>
              <Printer size={15} /> Print / PDF
            </button>
          </div>
        </>
      }
    >
      <div className="paper">
        <div className="paper-head">
          <div>
            <div className="paper-company">{c.legalName || data.settings.companyName || 'Your company'}</div>
            <div className="paper-small" style={{ whiteSpace: 'pre-line' }}>
              {c.address}
            </div>
            {c.taxId && <div className="paper-small">GSTIN: {c.taxId}</div>}
            <div className="paper-small">{[c.email, c.phone].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="paper-title">TAX INVOICE</div>
            <div className="paper-small">
              No. <b>{inv.number}</b>
            </div>
            <div className="paper-small">Date: {inv.issueDate}</div>
            <div className="paper-small">Due: {inv.dueDate}</div>
            {state === 'paid' && <div className="paper-stamp">PAID</div>}
          </div>
        </div>

        <div className="paper-bill">
          <div>
            <div className="paper-label">Bill to</div>
            <b>{inv.clientName}</b>
            <div className="paper-small" style={{ whiteSpace: 'pre-line' }}>
              {inv.clientAddress}
            </div>
            {inv.clientTaxId && <div className="paper-small">GSTIN: {inv.clientTaxId}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="paper-label">Place of supply</div>
            <div>{inv.placeOfSupply || '—'}</div>
          </div>
        </div>

        <table className="paper-table">
          <thead>
            <tr>
              <th>#</th>
              <th style={{ textAlign: 'left' }}>Description</th>
              <th>HSN/SAC</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>GST</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td style={{ textAlign: 'left' }}>{it.description}</td>
                <td>{it.code}</td>
                <td>{it.qty}</td>
                <td>{money.full(it.rate)}</td>
                <td>{it.taxRate}%</td>
                <td>{money.full(lineAmount(it))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="paper-totals">
          <div className="paper-words">
            <div className="paper-label">Amount in words</div>
            <div>{amountInWords(tt.total, data.settings.currency)}</div>
          </div>
          <table>
            <tbody>
              <tr>
                <td>Taxable value</td>
                <td>{money.full(tt.subtotal)}</td>
              </tr>
              {tt.split ? (
                <>
                  <tr>
                    <td>CGST</td>
                    <td>{money.full(tt.cgst)}</td>
                  </tr>
                  <tr>
                    <td>SGST</td>
                    <td>{money.full(tt.sgst)}</td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td>IGST</td>
                  <td>{money.full(tt.igst)}</td>
                </tr>
              )}
              <tr className="grand">
                <td>Total</td>
                <td>{money.full(tt.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="paper-foot">
          {(c.accountNumber || c.upi) && (
            <div>
              <div className="paper-label">Pay to</div>
              {c.accountNumber && (
                <div className="paper-small">
                  {c.accountName || c.legalName} · {c.bankName}
                  <br />
                  A/c {c.accountNumber} · IFSC {c.ifsc}
                </div>
              )}
              {c.upi && <div className="paper-small">UPI: {c.upi}</div>}
            </div>
          )}
          {inv.notes && <div className="paper-small" style={{ whiteSpace: 'pre-line' }}>{inv.notes}</div>}
          <div className="paper-sign">
            For {c.legalName || data.settings.companyName}
            <div style={{ height: 36 }} />
            Authorised signatory
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ───────── Editor ───────── */

export function InvoiceForm({ initial, onClose }: { initial?: Invoice; onClose: () => void }) {
  const { data, update, money } = useVault();
  const toast = useToast();
  const c = data.settings.company;
  const [inv, setInv] = useState<Invoice>(() => initial ?? newInvoice(c, crypto.randomUUID()));
  const [rates, setRates] = useState<string[]>(() => inv.items.map((it) => (it.rate ? toInput(it.rate) : '')));
  const [error, setError] = useState('');
  const set = (patch: Partial<Invoice>) => setInv((x) => ({ ...x, ...patch }));
  const setItem = (i: number, patch: Partial<InvoiceItem>) => setInv((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const tt = totals(inv, c);

  // Clients you've invoiced before, to fill details in one go.
  const clients = useMemo(() => {
    const m = new Map<string, Invoice>();
    for (const x of [...data.invoices].sort((a, b) => a.updatedAt - b.updatedAt)) if (x.clientName) m.set(x.clientName, x);
    return m;
  }, [data.invoices]);

  const save = (status: Invoice['status']) => (e?: FormEvent) => {
    e?.preventDefault();
    if (!inv.clientName.trim()) return setError('Who is this invoice for?');
    if (!inv.items.some((it) => it.description.trim() && it.rate > 0)) return setError('Add at least one item with a price.');
    if (data.invoices.some((x) => x.number === inv.number && x.id !== inv.id)) return setError(`Invoice number ${inv.number} is already used.`);
    const out: Invoice = { ...inv, status: initial?.status === 'paid' ? 'paid' : status, items: inv.items.filter((it) => it.description.trim() || it.rate), updatedAt: Date.now() };
    const usedAuto = !initial && inv.number === formatNumber(c);
    update((d) => ({
      ...d,
      invoices: initial ? d.invoices.map((x) => (x.id === out.id ? out : x)) : [out, ...d.invoices],
      settings: usedAuto ? { ...d.settings, company: { ...d.settings.company, nextInvoiceNumber: d.settings.company.nextInvoiceNumber + 1 } } : d.settings,
    }));
    toast(initial ? 'Invoice saved' : status === 'sent' ? `${out.number} created` : 'Draft saved');
    onClose();
  };

  const remove = () => {
    update((d) => ({ ...d, invoices: d.invoices.filter((x) => x.id !== inv.id) }));
    toast('Invoice deleted');
    onClose();
  };

  return (
    <Modal
      wide
      title={initial ? `Edit ${inv.number}` : 'New invoice'}
      onClose={onClose}
      footer={
        <>
          {initial && initial.status !== 'paid' && (
            <button className="btn ghost danger" onClick={remove}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          <div className="right">
            <button className="btn ghost" onClick={save('draft')}>
              {initial ? 'Save' : 'Save draft'}
            </button>
            {(!initial || initial.status === 'draft') && (
              <button className="btn primary" onClick={save('sent')}>
                <Send size={15} /> Save as sent
              </button>
            )}
          </div>
        </>
      }
    >
      <form className="stack" onSubmit={save('draft')}>
        <div className="form-grid">
          <Field label="Client">
            <input
              className="input"
              list="inv-clients"
              value={inv.clientName}
              onChange={(e) => {
                const prev = clients.get(e.target.value);
                setError('');
                set(
                  prev && !initial
                    ? { clientName: prev.clientName, clientAddress: prev.clientAddress, clientTaxId: prev.clientTaxId, clientEmail: prev.clientEmail, placeOfSupply: prev.placeOfSupply }
                    : { clientName: e.target.value },
                );
              }}
              placeholder="Company or person"
              autoFocus
            />
            <datalist id="inv-clients">
              {[...clients.keys()].map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <Field label="Client GSTIN" hint="Leave empty for unregistered clients.">
            <input className="input mono" value={inv.clientTaxId} onChange={(e) => set({ clientTaxId: e.target.value.toUpperCase() })} placeholder="29ABCDE1234F1Z5" />
          </Field>
          <Field label="Billing address">
            <textarea className="textarea" style={{ minHeight: 64 }} value={inv.clientAddress} onChange={(e) => set({ clientAddress: e.target.value })} />
          </Field>
          <div className="stack" style={{ gap: 14 }}>
            <Field label="Place of supply" hint={c.state ? (tt.split ? 'Same state: CGST + SGST' : 'Other state: IGST') : 'Set your state in Settings'}>
              <input className="input" list="inv-states" value={inv.placeOfSupply} onChange={(e) => set({ placeOfSupply: e.target.value })} placeholder="State" />
              <datalist id="inv-states">
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Client email">
              <input className="input" type="email" value={inv.clientEmail} onChange={(e) => set({ clientEmail: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="grid g-4" style={{ gap: 14 }}>
          <Field label="Invoice no.">
            <input className="input mono" value={inv.number} onChange={(e) => set({ number: e.target.value })} />
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={inv.issueDate} onChange={(e) => set({ issueDate: e.target.value || today(), dueDate: addDays(e.target.value || today(), c.paymentTermsDays) })} />
          </Field>
          <Field label="Due">
            <input className="input" type="date" value={inv.dueDate} onChange={(e) => set({ dueDate: e.target.value || today() })} />
          </Field>
          <Field label="Project">
            <select className="select" value={inv.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || undefined })}>
              <option value="">None</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="inv-items">
          <div className="inv-row inv-head">
            <span>Item</span>
            <span>HSN/SAC</span>
            <span>Qty</span>
            <span>Rate ({money.symbol})</span>
            <span>GST</span>
            <span style={{ textAlign: 'right' }}>Amount</span>
            <span />
          </div>
          {inv.items.map((it, i) => (
            <div key={it.id} className="inv-row">
              <input className="input" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="What you did or sold" aria-label="Description" />
              <input className="input mono" value={it.code} onChange={(e) => setItem(i, { code: e.target.value })} placeholder="998314" aria-label="HSN or SAC code" />
              <input className="input num" inputMode="decimal" value={it.qty} onChange={(e) => setItem(i, { qty: Math.max(0, Number(e.target.value.replace(/[^\d.]/g, '')) || 0) })} aria-label="Quantity" />
              <input
                className="input num"
                inputMode="decimal"
                value={rates[i] ?? ''}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.,]/g, '');
                  setRates((r) => r.map((x, j) => (j === i ? v : x)));
                  setItem(i, { rate: toMinor(v) ?? 0 });
                }}
                placeholder="0"
                aria-label="Rate"
              />
              <select className="select" value={it.taxRate} onChange={(e) => setItem(i, { taxRate: Number(e.target.value) })} aria-label="GST rate">
                {TAX_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
              <span className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
                {money.full(lineAmount(it))}
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Remove item"
                disabled={inv.items.length === 1}
                onClick={() => {
                  setInv((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }));
                  setRates((r) => r.filter((_, j) => j !== i));
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn ghost sm"
            style={{ justifySelf: 'start' }}
            onClick={() => {
              const last = inv.items[inv.items.length - 1];
              setInv((x) => ({ ...x, items: [...x.items, { id: crypto.randomUUID(), description: '', code: last?.code ?? '', qty: 1, rate: 0, taxRate: last?.taxRate ?? 18 }] }));
              setRates((r) => [...r, '']);
            }}
          >
            <Plus size={14} /> Add item
          </button>
        </div>

        <div className="form-grid">
          <Field label="Notes and terms">
            <textarea className="textarea" value={inv.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
          <div className="inv-sum">
            <div className="row between">
              <span className="muted">Taxable value</span>
              <span className="num">{money.full(tt.subtotal)}</span>
            </div>
            {tt.split ? (
              <>
                <div className="row between">
                  <span className="muted">CGST</span>
                  <span className="num">{money.full(tt.cgst)}</span>
                </div>
                <div className="row between">
                  <span className="muted">SGST</span>
                  <span className="num">{money.full(tt.sgst)}</span>
                </div>
              </>
            ) : (
              <div className="row between">
                <span className="muted">IGST</span>
                <span className="num">{money.full(tt.igst)}</span>
              </div>
            )}
            <div className="row between" style={{ fontSize: 18, fontWeight: 700, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <span>Total</span>
              <span className="num">{money.full(tt.total)}</span>
            </div>
            <div className="faint" style={{ fontSize: 12 }}>
              {amountInWords(tt.total, data.settings.currency)}
            </div>
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
      </form>
    </Modal>
  );
}
