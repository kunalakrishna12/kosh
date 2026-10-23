import { Download, ExternalLink, Github, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useTheme } from '../App';
import { StrengthMeter } from '../components/forms';
import { download, Field, Seg, useToast } from '../components/ui';
import { WrongPasswordError } from '../lib/crypto';
import { today } from '../lib/dates';
import { formatNumber, INDIAN_STATES } from '../lib/invoices';
import { CURRENCIES, toInput, toMinor } from '../lib/money';
import { strength } from '../lib/passwords';
import type { Book, CompanyProfile, ThemePref } from '../lib/types';
import { useVault } from '../store';

export const REPO_URL = 'https://github.com/kunalakrishna12/kosh';

function Row({ title, children, desc }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
      <div className="stack">{children}</div>
    </div>
  );
}

export function SettingsView() {
  const { data, update, demo, changePassword, exportBackup, importBackup, wipe } = useVault();
  const toast = useToast();
  const [theme, setTheme] = useTheme();
  const s = data.settings;
  const set = (patch: Partial<typeof s>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const setCo = (patch: Partial<CompanyProfile>) => update((d) => ({ ...d, settings: { ...d.settings, company: { ...d.settings.company, ...patch } } }));
  const co = s.company;
  const coField = (key: keyof CompanyProfile, label: string, opts: { placeholder?: string; mono?: boolean; full?: boolean; list?: string } = {}) => (
    <Field label={label} className={opts.full ? 'full' : undefined}>
      <input
        className={`input ${opts.mono ? 'mono' : ''}`}
        value={String(co[key])}
        placeholder={opts.placeholder}
        list={opts.list}
        onChange={(e) => setCo({ [key]: key === 'taxId' || key === 'ifsc' ? e.target.value.toUpperCase() : e.target.value } as Partial<CompanyProfile>)}
      />
    </Field>
  );
  const [opening, setOpening] = useState<Record<Book, string>>({ personal: toInput(s.openingBalance.personal), company: toInput(s.openingBalance.company) });
  const fileRef = useRef<HTMLInputElement>(null);

  const saveOpening = (book: Book) => {
    const v = opening[book].trim() === '' || opening[book].trim() === '0' ? 0 : toMinor(opening[book]);
    if (v === null) return;
    set({ openingBalance: { ...s.openingBalance, [book]: v } });
  };

  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submitPw = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Read the fields directly: a password manager may have filled them without an input event.
    const f = new FormData(e.currentTarget);
    const cur = String(f.get('current') ?? '');
    const next = String(f.get('next') ?? '');
    const confirm = String(f.get('confirm') ?? '');
    if (!cur || !next) return setPwMsg({ ok: false, text: 'Enter your current and new password.' });
    if (next.length < 10 || strength(next).score < 2) return setPwMsg({ ok: false, text: 'Choose a longer, harder-to-guess password.' });
    if (next !== confirm) return setPwMsg({ ok: false, text: "The new passwords don't match." });
    setBusy(true);
    try {
      await changePassword(cur, next);
      setCur('');
      setNext('');
      setConfirm('');
      setPwMsg({ ok: true, text: 'Master password changed. Old backups still open with the old password.' });
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof WrongPasswordError ? 'Current password is wrong.' : (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const [erase, setErase] = useState('');

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="card">
        <Row title="You and your company" desc="Used for greetings and labels across Kosh.">
          <div className="form-grid">
            <Field label="Your name">
              <input className="input" value={s.ownerName} onChange={(e) => set({ ownerName: e.target.value })} placeholder="Your first name" />
            </Field>
            <Field label="Company name">
              <input className="input" value={s.companyName} onChange={(e) => set({ companyName: e.target.value })} placeholder="Company" />
            </Field>
          </div>
        </Row>
        <Row title="Currency" desc="Every amount is shown in this currency.">
          <select
            className="select"
            value={s.currency}
            onChange={(e) => {
              const c = CURRENCIES.find((x) => x.code === e.target.value)!;
              set({ currency: c.code, locale: c.locale });
            }}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.label}
              </option>
            ))}
          </select>
        </Row>
        <Row title="Financial year" desc="Reports and tax summaries follow this year. India runs April to March.">
          <select className="select" value={s.fyStartMonth} onChange={(e) => set({ fyStartMonth: Number(e.target.value) })}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                Starts in {new Date(2000, i, 1).toLocaleDateString('en', { month: 'long' })}
              </option>
            ))}
          </select>
        </Row>
        <Row title="Opening balances" desc="Cash you had before your first entry, so balances start at the right number.">
          <div className="form-grid">
            {(['personal', 'company'] as Book[]).map((b) => (
              <Field key={b} label={b === 'personal' ? 'Personal cash' : `${s.companyName || 'Company'} cash`}>
                <input
                  className="input num"
                  inputMode="decimal"
                  value={opening[b]}
                  onChange={(e) => setOpening({ ...opening, [b]: e.target.value })}
                  onBlur={() => saveOpening(b)}
                  placeholder="0"
                />
              </Field>
            ))}
          </div>
        </Row>
        <Row title="Appearance" desc="Follow your system, or pick one.">
          <Seg<ThemePref>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </Row>
      </div>

      <h2 className="section-title mt-lg">Company details for invoices</h2>
      <p className="section-sub">Printed on every invoice. Your state decides whether GST is split into CGST + SGST or charged as IGST.</p>
      <div className="card">
        <Row title="Business" desc="Your registered name, address and GSTIN.">
          <div className="form-grid">
            {coField('legalName', 'Legal name', { placeholder: 'Acme Technologies Private Limited', full: true })}
            <Field label="Address" className="full">
              <textarea className="textarea" style={{ minHeight: 64 }} value={co.address} onChange={(e) => setCo({ address: e.target.value })} />
            </Field>
            {coField('state', 'State', { list: 'co-states' })}
            <datalist id="co-states">
              {INDIAN_STATES.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
            {coField('taxId', 'GSTIN / VAT number', { mono: true, placeholder: '36ABCDE1234F1Z5' })}
            {coField('email', 'Billing email')}
            {coField('phone', 'Phone')}
          </div>
        </Row>
        <Row title="Getting paid" desc="Bank and UPI details shown at the bottom of invoices.">
          <div className="form-grid">
            {coField('bankName', 'Bank and branch')}
            {coField('accountName', 'Account name')}
            {coField('accountNumber', 'Account number', { mono: true })}
            {coField('ifsc', 'IFSC / SWIFT', { mono: true })}
            {coField('upi', 'UPI ID', { mono: true, placeholder: 'yourbusiness@bank', full: true })}
          </div>
        </Row>
        <Row title="Numbering and terms" desc={`Next invoice will be ${formatNumber(co)}.`}>
          <div className="form-grid">
            {coField('invoicePrefix', 'Prefix', { mono: true, placeholder: 'INV-' })}
            <Field label="Next number">
              <input className="input num" inputMode="numeric" value={co.nextInvoiceNumber} onChange={(e) => setCo({ nextInvoiceNumber: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} />
            </Field>
            <Field label="Payment terms (days)">
              <input className="input num" inputMode="numeric" value={co.paymentTermsDays} onChange={(e) => setCo({ paymentTermsDays: Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0) })} />
            </Field>
            <Field label="Default notes" className="full">
              <textarea className="textarea" style={{ minHeight: 60 }} value={co.invoiceNotes} onChange={(e) => setCo({ invoiceNotes: e.target.value })} />
            </Field>
          </div>
        </Row>
      </div>

      <h2 className="section-title mt-lg">Import rules</h2>
      <p className="section-sub">Learned when you correct a category during a statement import. The first matching rule wins.</p>
      <div className="card">
        {data.rules.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>
            No rules yet. Import a statement and fix a category, and Kosh will remember it.
          </p>
        )}
        {data.rules.map((r) => (
          <div key={r.id} className="cat-row" style={{ gridTemplateColumns: '10px 1fr auto auto' }}>
            <i className="swatch" style={{ background: r.book === 'company' ? 'var(--company)' : 'var(--personal)' }} />
            <span>
              Contains <b className="mono">“{r.match}”</b> → {r.category}
            </span>
            <span className="faint" style={{ fontSize: 12 }}>
              {r.book === 'company' ? 'Company' : 'Personal'}
            </span>
            <button className="icon-btn" aria-label={`Delete rule ${r.match}`} onClick={() => update((d) => ({ ...d, rules: d.rules.filter((x) => x.id !== r.id) }))}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <h2 className="section-title mt-lg">Security</h2>
      <p className="section-sub">Your vault is encrypted with AES-256-GCM. The key comes from your master password through 600,000 rounds of PBKDF2-SHA256.</p>
      <div className="card">
        <Row title="Auto-lock" desc="Lock Kosh after this long without activity.">
          <select className="select" value={s.autoLockMinutes} onChange={(e) => set({ autoLockMinutes: Number(e.target.value) })}>
            {[1, 5, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                After {m} minute{m > 1 ? 's' : ''}
              </option>
            ))}
            <option value={0}>Never</option>
          </select>
        </Row>
        <Row title="Master password" desc="Re-encrypts the whole vault with a new key.">
          {demo ? (
            <p className="muted" style={{ margin: 0 }}>
              Not available in the demo.
            </p>
          ) : (
            <form className="stack" onSubmit={submitPw}>
              <input className="input" type="password" name="current" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} onBlur={(e) => setCur(e.currentTarget.value)} autoComplete="current-password" />
              <div>
                <input className="input" type="password" name="next" placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} onBlur={(e) => setNext(e.currentTarget.value)} autoComplete="new-password" />
                <StrengthMeter password={next} />
              </div>
              <input className="input" type="password" name="confirm" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onBlur={(e) => setConfirm(e.currentTarget.value)} autoComplete="new-password" />
              {pwMsg && <div className={pwMsg.ok ? 'up' : 'error-text'}>{pwMsg.text}</div>}
              <button className="btn" disabled={busy}>
                {busy ? 'Re-encrypting…' : 'Change password'}
              </button>
            </form>
          )}
        </Row>
        <Row title="Encrypted backup" desc="One file with everything, documents included, that only your master password can open. Keep a copy somewhere safe, like a USB drive or cloud folder.">
          <div className="row wrap">
            <button
              className="btn"
              disabled={demo}
              onClick={async () => {
                download(await exportBackup(), `kosh-backup-${today()}.kosh`);
                toast('Encrypted backup downloaded');
              }}
            >
              <Download size={15} /> Download backup
            </button>
            <button className="btn ghost" disabled={demo} onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Restore…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".kosh,.json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (!window.confirm(`Replace this vault with ${f.name}? You will need that backup's password to open it.`)) return;
                try {
                  await importBackup(f);
                } catch (err) {
                  toast((err as Error).message);
                }
              }}
            />
          </div>
        </Row>
        <Row title="Erase this vault" desc="Deletes everything on this device. This cannot be undone. Download a backup first.">
          <div className="row wrap">
            <input className="input" style={{ maxWidth: 220 }} placeholder='Type "erase" to confirm' value={erase} onChange={(e) => setErase(e.target.value)} />
            <button className="btn danger solid" disabled={erase !== 'erase' || demo} onClick={() => void wipe()}>
              Erase vault
            </button>
          </div>
        </Row>
      </div>

      <div className="card mt-lg row between wrap">
        <div className="row">
          <ShieldCheck size={18} style={{ color: 'var(--gold)' }} />
          <span className="muted">Kosh is free and open source. No accounts, no servers, no tracking.</span>
        </div>
        <a className="btn ghost sm" href={REPO_URL} target="_blank" rel="noopener noreferrer">
          <Github size={14} /> Source code <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
