import { FileText, FileUp, Receipt, Sparkles, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { AccountSelect, BookLabel } from '../components/forms';
import { accountFromStatement, defaultAccountId } from '../lib/accounts';
import { Modal, Seg, useToast } from '../components/ui';
import { advance } from '../lib/bills';
import { addDays, dayLabel, today } from '../lib/dates';
import { paymentEntries } from '../lib/invoices';
import { buildRows, detectMapping, merchantKey, parseCsv, type DateFormat, type ImportRow, type Mapping } from '../lib/importer';
import { DEFAULT_CATEGORIES, type Book, type Rule, type Transaction } from '../lib/types';
import { useVault } from '../store';

/** A believable bank statement export (HDFC-style), for trying the importer in the demo. */
function sampleStatement(): string {
  const t = today();
  const d = (n: number) => {
    const [y, m, dd] = addDays(t, -n).split('-');
    return `${dd}/${m}/${y.slice(2)}`;
  };
  const rows: [string, string, string, string][] = [
    [d(1), 'UPI-SWIGGY-SWIGGY8@ICICI-ICIC0DC0099-4123', '486.00', ''],
    [d(2), 'POS 4591XXXX AMAZON WEB SERVICES AWS.AMAZON.CO', '31240.55', ''],
    [d(3), 'NEFT CR-KITE LOGISTICS PVT LTD-INV LS/26-27/0012', '', '259600.00'],
    [d(3), 'UPI-UBER INDIA-UBERINDIA@AXISBANK-UTIB0000100', '312.40', ''],
    [d(4), 'ACH D- OPENAI LLC CHATGPT API', '9875.00', ''],
    [d(5), 'UPI-BIGBASKET-BIGBASKET@HDFCBANK-HDFC0000001', '2874.00', ''],
    [d(6), 'IMPS-RAO AND ASSOCIATES-CA FEES Q2', '35400.00', ''],
    [d(7), 'UPI-BLUE TOKAI COFFEE-BLUETOKAI@YBL', '640.00', ''],
    [d(8), 'POS 4591XXXX FIGMA INC SAN FRANCISCO', '9800.00', ''],
    [d(9), 'UPI-ZOMATO-ZOMATO@HDFCBANK', '1120.00', ''],
    [d(10), 'NEFT CR-PEBBLE TECHNOLOGIES-RETAINER', '', '250000.00'],
    [d(11), 'UPI-INDIGO AIRLINES-INDIGO@ICICI', '8964.00', ''],
    [d(12), 'CREDIT INTEREST CAPITALISED', '', '1842.00'],
  ];
  return [
    'HDFC BANK Ltd.  Statement of account',
    'Account No : 50200071234567     Currency : INR',
    '',
    'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
    ...rows.map(([date, narr, wd, dep], i) => `${date},"${narr}",0000${4100 + i},${date},${wd},${dep},`),
  ].join('\n');
}

export function ImportForm({ onClose }: { onClose: () => void }) {
  const { data, update, money, addDoc } = useVault();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [raw, setRaw] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [book, setBook] = useState<Book>('company');
  const [accountId, setAccountId] = useState('');
  const [detected, setDetected] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [suggested, setSuggested] = useState<Map<string, string>>(new Map());
  const [skipped, setSkipped] = useState(0);
  const [remember, setRemember] = useState(true);
  const [keepFile, setKeepFile] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const rebuild = (r: string[][], m: Mapping, b: Book) => {
    const out = buildRows(r, m, b, data);
    setRows(out.rows);
    setSkipped(out.skipped);
    setSuggested(new Map(out.rows.map((x) => [x.key, x.category])));
  };

  const load = async (f: File) => {
    setError('');
    const text = await f.text();
    const parsed = parseCsv(text);
    const m = detectMapping(parsed);
    if (!m) return setError("Couldn't find a header row with a date and amount columns. Export the statement as CSV from your bank and try again.");
    setFile(f);
    setRaw(parsed);
    setMapping(m);
    // Recognise the account from the number printed above the table.
    const acct = accountFromStatement(data, parsed.slice(0, m.headerRow));
    const b = acct?.book ?? book;
    setBook(b);
    setAccountId(acct?.id ?? defaultAccountId(data, b) ?? '');
    setDetected(!!acct);
    rebuild(parsed, m, b);
  };

  const remap = (patch: Partial<Mapping>) => {
    if (!raw || !mapping) return;
    const m = { ...mapping, ...patch };
    setMapping(m);
    rebuild(raw, m, book);
  };

  const categories = useMemo(
    () => [...new Set([...DEFAULT_CATEGORIES[book].expense, ...DEFAULT_CATEGORIES[book].income, ...data.transactions.filter((t) => t.book === book).map((t) => t.category)])].sort(),
    [book, data.transactions],
  );

  const chosen = rows.filter((r) => r.include);
  const inTotal = chosen.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0);
  const outTotal = chosen.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0);
  const setRow = (key: string, patch: Partial<ImportRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const doImport = async () => {
    setBusy(true);
    const now = Date.now();
    // A credit that pays an invoice is recorded the way "Mark paid" records it: one entry per GST rate.
    const paidInvoices = new Map(chosen.filter((r) => r.invoiceId).map((r) => [r.invoiceId!, r.date]));
    const invoiceTxs = [...paidInvoices].flatMap(([id, date]) => paymentEntries(data.invoices.find((x) => x.id === id)!, data.settings.company, date, () => crypto.randomUUID(), accountId || undefined));
    const txs: Transaction[] = chosen.filter((r) => !r.invoiceId).map((r, i) => ({
      id: crypto.randomUUID(),
      book,
      kind: r.kind,
      amount: r.amount,
      category: r.category || 'Other',
      date: r.date,
      note: r.description,
      ...(r.billId ? { billId: r.billId } : {}),
      ...(accountId ? { accountId } : {}),
      createdAt: now - i,
    }));
    // Corrections you made become rules for next time.
    const newRules: Rule[] = [];
    if (remember) {
      for (const r of chosen) {
        const key = merchantKey(r.description);
        if (key && r.category !== suggested.get(r.key) && !newRules.some((x) => x.match === key) && !data.rules.some((x) => x.book === book && x.match === key)) {
          newRules.push({ id: crypto.randomUUID(), book, match: key, category: r.category, createdAt: now });
        }
      }
    }
    const paidBills = new Set(chosen.filter((r) => r.billId).map((r) => r.billId!));
    update((d) => ({
      ...d,
      transactions: [...invoiceTxs, ...txs, ...d.transactions],
      invoices: d.invoices.map((x) => (paidInvoices.has(x.id) ? { ...x, status: 'paid', paidDate: paidInvoices.get(x.id), updatedAt: now } : x)),
      rules: [...d.rules, ...newRules],
      bills: d.bills.map((b) => (paidBills.has(b.id) ? { ...b, nextDue: advance(b.nextDue, b.frequency) } : b)),
    }));
    if (keepFile && file) {
      try {
        await addDoc(file, { book, folder: 'bank', tags: ['statement'], notes: `Imported ${chosen.length} entries on ${dayLabel(today())}` });
      } catch {
        /* the import itself succeeded */
      }
    }
    toast(
      `Imported ${chosen.length} entries${paidInvoices.size ? ` · ${paidInvoices.size} invoice${paidInvoices.size > 1 ? 's' : ''} marked paid` : ''}${newRules.length ? ` · learned ${newRules.length} rule${newRules.length > 1 ? 's' : ''}` : ''}`,
    );
    onClose();
  };

  const headers = raw && mapping ? raw[mapping.headerRow] : [];
  const ColumnSelect = ({ label, value, onChange, optional }: { label: string; value: number; onChange: (v: number) => void; optional?: boolean }) => (
    <label className="field">
      <span>{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {optional && <option value={-1}>—</option>}
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Modal
      wide
      title="Import a bank statement"
      onClose={onClose}
      footer={
        rows.length > 0 ? (
          <>
            <span className="faint" style={{ fontSize: 13, alignSelf: 'center' }}>
              {chosen.length} of {rows.length} selected · in {money.compact(inTotal)} · out {money.compact(outTotal)}
            </span>
            <div className="right">
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn primary" onClick={doImport} disabled={!chosen.length || busy}>
                <FileUp size={15} /> Import {chosen.length}
              </button>
            </div>
          </>
        ) : undefined
      }
    >
      {!raw ? (
        <div className="stack">
          <div
            className="dropzone"
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void load(f);
            }}
          >
            <Upload size={20} />
            <div>
              <b>Choose a CSV statement</b>
              <div className="faint" style={{ fontSize: 12.5 }}>
                Works with HDFC, ICICI, SBI, Axis, Kotak and most banks and cards worldwide. In net banking, download the statement as CSV (or open the Excel
                file and save it as CSV).
              </div>
            </div>
            <input ref={input} type="file" accept=".csv,text/csv,.txt" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          </div>
          <button className="btn ghost" style={{ justifySelf: 'start' }} onClick={() => load(new File([sampleStatement()], 'sample-hdfc-statement.csv', { type: 'text/csv' }))}>
            <Sparkles size={15} /> Try a sample statement
          </button>
          <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>
            The file is read on this device. Nothing is uploaded anywhere.
          </p>
          {error && <div className="error-text">{error}</div>}
        </div>
      ) : (
        <div className="stack">
          <div className="row between wrap">
            <Seg
              label="Import into"
              value={book}
              onChange={(b) => {
                setBook(b);
                setAccountId(defaultAccountId(data, b) ?? '');
                setDetected(false);
                if (raw && mapping) rebuild(raw, mapping, b);
              }}
              options={[
                { value: 'company', label: <BookLabel book="company" /> },
                { value: 'personal', label: <BookLabel book="personal" /> },
              ]}
            />
            <span className="faint" style={{ fontSize: 12.5 }}>
              {file?.name} · {rows.length} entries{skipped ? ` · ${skipped} lines skipped (totals, blanks)` : ''}
            </span>
          </div>
          <div style={{ maxWidth: 360 }}>
            <AccountSelect book={book} value={accountId} onChange={(id) => (setAccountId(id), setDetected(false))} label={detected ? 'Statement of (recognised from the account number)' : 'Statement of which account?'} />
          </div>

          {mapping && (
            <details className="mapping">
              <summary>Columns: {headers[mapping.date]} · {headers[mapping.description]} · {mapping.debit >= 0 && mapping.credit >= 0 ? `${headers[mapping.debit]} / ${headers[mapping.credit]}` : headers[mapping.amount]}</summary>
              <div className="grid g-3 mt" style={{ gap: 12 }}>
                <ColumnSelect label="Date" value={mapping.date} onChange={(v) => remap({ date: v })} />
                <ColumnSelect label="Description" value={mapping.description} onChange={(v) => remap({ description: v })} />
                <label className="field">
                  <span>Date format</span>
                  <select className="select" value={mapping.dateFormat} onChange={(e) => remap({ dateFormat: e.target.value as DateFormat })}>
                    <option value="dmy">Day / Month / Year</option>
                    <option value="mdy">Month / Day / Year</option>
                    <option value="ymd">Year-Month-Day</option>
                  </select>
                </label>
                <ColumnSelect label="Money out (debit)" value={mapping.debit} onChange={(v) => remap({ debit: v })} optional />
                <ColumnSelect label="Money in (credit)" value={mapping.credit} onChange={(v) => remap({ credit: v })} optional />
                <ColumnSelect label="Single amount (+/−)" value={mapping.amount} onChange={(v) => remap({ amount: v })} optional />
              </div>
            </details>
          )}

          <div className="import-table">
            <div className="import-row import-head">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={chosen.length === rows.length && rows.length > 0}
                onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, include: e.target.checked })))}
              />
              <span>Date</span>
              <span>Description</span>
              <span>Category</span>
              <span style={{ textAlign: 'right' }}>Amount</span>
            </div>
            {rows.map((r) => {
              const bill = r.billId ? data.bills.find((b) => b.id === r.billId) : undefined;
              const invoice = r.invoiceId ? data.invoices.find((x) => x.id === r.invoiceId) : undefined;
              return (
                <div key={r.key} className={`import-row ${r.include ? '' : 'off'}`}>
                  <input type="checkbox" checked={r.include} onChange={(e) => setRow(r.key, { include: e.target.checked })} aria-label="Include" />
                  <span className="faint" style={{ fontSize: 12.5 }}>
                    {dayLabel(r.date)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="tx-t" style={{ fontSize: 13 }} title={r.description}>
                      {r.description}
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      {r.duplicate && <span className="pill warn" style={{ height: 18, fontSize: 10.5 }}>Already in Kosh</span>}
                      {bill && (
                        <span className="pill gold" style={{ height: 18, fontSize: 10.5 }}>
                          <Receipt size={10} /> {bill.name} bill
                        </span>
                      )}
                      {invoice && (
                        <span className="pill good" style={{ height: 18, fontSize: 10.5 }}>
                          <FileText size={10} /> Pays {invoice.number}
                        </span>
                      )}
                      {r.source === 'rule' && !bill && !invoice && <span className="pill" style={{ height: 18, fontSize: 10.5 }}>Your rule</span>}
                      {r.source === 'history' && <span className="pill" style={{ height: 18, fontSize: 10.5 }}>Like before</span>}
                    </div>
                  </div>
                  <input className="input" style={{ height: 32 }} list="import-cats" value={r.category} onChange={(e) => setRow(r.key, { category: e.target.value })} aria-label="Category" />
                  <span className={`num ${r.kind === 'income' ? 'up' : ''}`} style={{ textAlign: 'right', fontWeight: 600, fontSize: 13 }}>
                    {r.kind === 'income' ? '+' : '−'}
                    {money.full(r.amount)}
                  </span>
                </div>
              );
            })}
            <datalist id="import-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="row wrap" style={{ gap: 20 }}>
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember my category changes as rules
            </label>
            <label className="check">
              <input type="checkbox" checked={keepFile} onChange={(e) => setKeepFile(e.target.checked)} />
              Keep the statement in Documents (encrypted)
            </label>
          </div>
        </div>
      )}
    </Modal>
  );
}
