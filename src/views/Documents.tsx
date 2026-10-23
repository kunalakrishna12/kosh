import { CalendarClock, Download, File, FileImage, FileSpreadsheet, FileText, FolderLock, Lock, Pencil, Search, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BookLabel } from '../components/forms';
import { download, Empty, Field, Modal, Seg, useToast } from '../components/ui';
import { addDays, dayLabel, parseDate, today } from '../lib/dates';
import { DOC_FOLDER_LABEL, type Book, type Doc, type DocFolder } from '../lib/types';
import { useNav } from '../nav';
import { MAX_DOC_BYTES, useVault } from '../store';

export function fileSize(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function DocIcon({ mime, size = 18 }: { mime: string; size?: number }) {
  if (mime.startsWith('image/')) return <FileImage size={size} />;
  if (mime === 'application/pdf' || mime.startsWith('text/')) return <FileText size={size} />;
  if (/sheet|excel|csv/.test(mime)) return <FileSpreadsheet size={size} />;
  return <File size={size} />;
}

function daysUntil(date: string) {
  return Math.round((parseDate(date).getTime() - parseDate(today()).getTime()) / 86_400_000);
}

export function ExpiryPill({ date }: { date: string }) {
  const d = daysUntil(date);
  const cls = d < 0 ? 'bad' : d <= 30 ? 'bad' : d <= 90 ? 'warn' : '';
  return <span className={`pill ${cls}`}>{d < 0 ? `Expired ${-d}d ago` : d === 0 ? 'Expires today' : d <= 90 ? `Expires in ${d}d` : `Expires ${dayLabel(date)}`}</span>;
}

export function Documents() {
  const { data } = useVault();
  const nav = useNav();
  const [q, setQ] = useState('');
  const [book, setBook] = useState<Book | 'all'>('all');
  const [folder, setFolder] = useState<DocFolder | 'all' | 'expiring'>('all');
  const [preview, setPreview] = useState<Doc | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const expiring = data.docs.filter((d) => d.expiresOn && d.expiresOn <= addDays(today(), 90)).sort((a, b) => (a.expiresOn! < b.expiresOn! ? -1 : 1));
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of data.docs) if (book === 'all' || d.book === book) m.set(d.folder, (m.get(d.folder) ?? 0) + 1);
    return m;
  }, [data.docs, book]);

  const list = data.docs
    .filter((d) => book === 'all' || d.book === book)
    .filter((d) => (folder === 'all' ? true : folder === 'expiring' ? expiring.includes(d) : d.folder === folder))
    .filter((d) => !q.trim() || `${d.name} ${d.tags.join(' ')} ${d.notes} ${DOC_FOLDER_LABEL[d.folder]}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);

  const totalSize = data.docs.reduce((s, d) => s + d.size, 0);
  const upload = (files: FileList | File[] | null) => {
    if (files && files.length) nav.open({ type: 'upload', files: [...files], defaults: { folder: folder === 'all' || folder === 'expiring' ? undefined : folder, book: book === 'all' ? undefined : book } });
  };

  const dropZone = (
    <div
      className={`dropzone ${drag ? 'over' : ''}`}
      onDragOver={(e) => (e.preventDefault(), setDrag(true))}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        upload(e.dataTransfer.files);
      }}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
    >
      <Upload size={20} />
      <div>
        <b>Drop files here, or click to choose</b>
        <div className="faint" style={{ fontSize: 12.5 }}>
          PDFs, photos, spreadsheets, anything up to 25 MB. Encrypted on this device before they're saved.
        </div>
      </div>
      <input ref={input} type="file" multiple hidden onChange={(e) => (upload(e.target.files), (e.target.value = ''))} />
    </div>
  );

  if (!data.docs.length) {
    return (
      <div className="stack" style={{ gap: 16 }}>
        <div className="card">
          <Empty icon={<FolderLock size={22} />} title="Every important document, encrypted in one place">
            Incorporation papers, GST certificates, contracts, bank statements, receipts, IDs and insurance policies. Kosh reminds you before passports,
            policies and leases expire.
          </Empty>
          {dropZone}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid g-main">
        <div className="card">
          <div className="row between wrap">
            <div className="row" style={{ gap: 14 }}>
              <div className="vault-ring" style={{ width: 48, height: 48, borderRadius: 14 }}>
                <Lock size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 620, fontSize: 15 }}>
                  {data.docs.length} documents · {fileSize(totalSize)}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Each file is encrypted with AES-256-GCM and included in your backups.
                </div>
              </div>
            </div>
          </div>
          <div className="mt">{dropZone}</div>
        </div>
        <div className="card">
          <div className="card-h">
            <div>
              <h2>
                <CalendarClock size={14} style={{ verticalAlign: -2 }} /> Expiring soon
              </h2>
              <div className="sub">Next 90 days</div>
            </div>
          </div>
          {expiring.length === 0 && <p className="muted" style={{ margin: 0 }}>Nothing expiring soon.</p>}
          <div className="stack" style={{ gap: 10 }}>
            {expiring.slice(0, 5).map((d) => (
              <button key={d.id} className="doc-line" onClick={() => setPreview(d)}>
                <DocIcon mime={d.mime} size={16} />
                <span className="tx-t" style={{ flex: 1, textAlign: 'left' }}>
                  {d.name}
                </span>
                <ExpiryPill date={d.expiresOn!} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="toolbar mt">
        <div className="search">
          <Search size={15} />
          <input className="input" placeholder="Search documents…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search documents" />
        </div>
        <Seg
          label="Book"
          value={book}
          onChange={setBook}
          options={[
            { value: 'all', label: 'All' },
            { value: 'company', label: 'Company' },
            { value: 'personal', label: 'Personal' },
          ]}
        />
      </div>
      <div className="folder-chips">
        <button aria-pressed={folder === 'all'} onClick={() => setFolder('all')}>
          All <span>{[...counts.values()].reduce((a, b) => a + b, 0)}</span>
        </button>
        {expiring.length > 0 && (
          <button aria-pressed={folder === 'expiring'} onClick={() => setFolder('expiring')}>
            Expiring <span>{expiring.length}</span>
          </button>
        )}
        {(Object.keys(DOC_FOLDER_LABEL) as DocFolder[])
          .filter((f) => counts.get(f))
          .map((f) => (
            <button key={f} aria-pressed={folder === f} onClick={() => setFolder(f)}>
              {DOC_FOLDER_LABEL[f]} <span>{counts.get(f)}</span>
            </button>
          ))}
      </div>

      <div className="doc-grid">
        {list.map((d) => (
          <button key={d.id} className="doc-card" onClick={() => setPreview(d)}>
            <div className={`doc-thumb ${d.book}`}>
              <DocIcon mime={d.mime} size={26} />
              <span className="doc-ext">{(d.name.split('.').pop() ?? '').slice(0, 4)}</span>
            </div>
            <div className="doc-name">{d.name}</div>
            <div className="doc-meta">
              {DOC_FOLDER_LABEL[d.folder]} · {fileSize(d.size)}
            </div>
            {d.expiresOn && <ExpiryPill date={d.expiresOn} />}
          </button>
        ))}
        {list.length === 0 && <Empty icon={<Search size={22} />} title="No documents match" />}
      </div>

      {preview && <DocPreview doc={data.docs.find((d) => d.id === preview.id) ?? preview} onClose={() => setPreview(null)} />}
    </>
  );
}

/* ───────── Upload ───────── */

export function UploadForm({ files, defaults, onClose }: { files: File[]; defaults?: { folder?: DocFolder; book?: Book; linkId?: string }; onClose: () => void }) {
  const { addDoc } = useVault();
  const toast = useToast();
  const guess = (f: File): DocFolder =>
    /invoice/i.test(f.name) ? 'invoices' : /statement|bank/i.test(f.name) ? 'bank' : /gst|itr|tax|pan|tds/i.test(f.name) ? 'tax' : /receipt|bill/i.test(f.name) ? 'receipts' : /agreement|contract|nda|msa|lease/i.test(f.name) ? 'contracts' : /passport|aadhaar|licen[cs]e|kyc/i.test(f.name) ? 'identity' : /policy|insurance/i.test(f.name) ? 'insurance' : 'other';
  const [book, setBook] = useState<Book>(defaults?.book ?? 'company');
  const [folder, setFolder] = useState<DocFolder>(defaults?.folder ?? (defaults?.linkId ? 'receipts' : guess(files[0])));
  const [name, setName] = useState(files.length === 1 ? files[0].name : '');
  const [expiresOn, setExpiresOn] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tooBig = files.filter((f) => f.size > MAX_DOC_BYTES);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      for (const f of files.filter((x) => x.size <= MAX_DOC_BYTES)) {
        await addDoc(f, {
          name: files.length === 1 ? name.trim() || f.name : f.name,
          book,
          folder,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          notes,
          ...(expiresOn ? { expiresOn } : {}),
          ...(defaults?.linkId ? { linkId: defaults.linkId } : {}),
        });
      }
      toast(files.length === 1 ? 'Document encrypted and saved' : `${files.length - tooBig.length} documents encrypted and saved`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={files.length === 1 ? 'Add document' : `Add ${files.length} documents`}
      onClose={onClose}
      footer={
        <div className="right">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" form="upload-form" disabled={busy || tooBig.length === files.length}>
            <Lock size={15} /> {busy ? 'Encrypting…' : 'Encrypt and save'}
          </button>
        </div>
      }
    >
      <form id="upload-form" className="stack" onSubmit={submit}>
        <div className="stack" style={{ gap: 6 }}>
          {files.slice(0, 5).map((f) => (
            <div key={f.name + f.size} className="row" style={{ gap: 10, fontSize: 13 }}>
              <DocIcon mime={f.type} size={16} />
              <span className="tx-t" style={{ flex: 1 }}>
                {f.name}
              </span>
              <span className={f.size > MAX_DOC_BYTES ? 'down' : 'faint'}>{f.size > MAX_DOC_BYTES ? 'Too large' : fileSize(f.size)}</span>
            </div>
          ))}
          {files.length > 5 && <span className="faint">and {files.length - 5} more</span>}
        </div>
        <Seg
          label="Belongs to"
          value={book}
          onChange={setBook}
          options={[
            { value: 'company', label: <BookLabel book="company" /> },
            { value: 'personal', label: <BookLabel book="personal" /> },
          ]}
        />
        <div className="form-grid">
          {files.length === 1 && (
            <Field label="Name" className="full">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
          <Field label="Folder">
            <select className="select" value={folder} onChange={(e) => setFolder(e.target.value as DocFolder)}>
              {(Object.keys(DOC_FOLDER_LABEL) as DocFolder[]).map((f) => (
                <option key={f} value={f}>
                  {DOC_FOLDER_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Expires on" hint="Optional. You'll be reminded 90 days before.">
            <input className="input" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </Field>
          <Field label="Tags" className="full">
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="GST, FY26, client" />
          </Field>
          <Field label="Notes" className="full">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Policy number, where the original is kept…" />
          </Field>
        </div>
        {error && <div className="error-text">{error}</div>}
      </form>
    </Modal>
  );
}

/* ───────── Preview & edit ───────── */

export function DocPreview({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const { data, openDoc, removeDoc, update } = useVault();
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [sure, setSure] = useState(false);
  const [meta, setMeta] = useState({ name: doc.name, folder: doc.folder, expiresOn: doc.expiresOn ?? '', notes: doc.notes, tags: doc.tags.join(', ') });

  useEffect(() => {
    let u: string | null = null;
    openDoc(doc)
      .then((b) => {
        setBlob(b);
        u = URL.createObjectURL(b);
        setUrl(u);
      })
      .catch((e) => setError((e as Error).message));
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  const linked = doc.linkId
    ? data.transactions.find((t) => t.id === doc.linkId)?.note ?? data.bills.find((b) => b.id === doc.linkId)?.name ?? data.invoices.find((i) => i.id === doc.linkId)?.number
    : undefined;

  const saveMeta = () => {
    update((d) => ({
      ...d,
      docs: d.docs.map((x) =>
        x.id === doc.id
          ? { ...x, name: meta.name.trim() || x.name, folder: meta.folder, expiresOn: meta.expiresOn || undefined, notes: meta.notes, tags: meta.tags.split(',').map((t) => t.trim()).filter(Boolean) }
          : x,
      ),
    }));
    setEditing(false);
    toast('Document updated');
  };

  const canPreview = doc.mime === 'application/pdf' || doc.mime.startsWith('image/') || doc.mime.startsWith('text/');

  return (
    <Modal
      wide
      title={doc.name}
      onClose={onClose}
      footer={
        <>
          <button
            className={`btn danger ${sure ? 'solid' : 'ghost'}`}
            onClick={async () => {
              if (!sure) return setSure(true);
              await removeDoc(doc.id);
              toast('Document deleted');
              onClose();
            }}
          >
            <Trash2 size={15} /> {sure ? 'Delete for good?' : 'Delete'}
          </button>
          <div className="right">
            <button className="btn ghost" onClick={() => setEditing(!editing)}>
              <Pencil size={14} /> Details
            </button>
            <button className="btn primary" disabled={!blob} onClick={() => blob && download(blob, doc.name)}>
              <Download size={15} /> Download
            </button>
          </div>
        </>
      }
    >
      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <span className={`pill ${doc.book}`}>{doc.book === 'company' ? 'Company' : 'Personal'}</span>
        <span className="pill">{DOC_FOLDER_LABEL[doc.folder]}</span>
        <span className="pill">{fileSize(doc.size)}</span>
        {doc.expiresOn && <ExpiryPill date={doc.expiresOn} />}
        {doc.tags.map((t) => (
          <span key={t} className="pill gold">
            {t}
          </span>
        ))}
        {linked && <span className="pill">Linked to {linked}</span>}
      </div>
      {editing && (
        <div className="card form-grid" style={{ background: 'var(--bg-2)', marginBottom: 14 }}>
          <Field label="Name" className="full">
            <input className="input" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
          </Field>
          <Field label="Folder">
            <select className="select" value={meta.folder} onChange={(e) => setMeta({ ...meta, folder: e.target.value as DocFolder })}>
              {(Object.keys(DOC_FOLDER_LABEL) as DocFolder[]).map((f) => (
                <option key={f} value={f}>
                  {DOC_FOLDER_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Expires on">
            <input className="input" type="date" value={meta.expiresOn} onChange={(e) => setMeta({ ...meta, expiresOn: e.target.value })} />
          </Field>
          <Field label="Tags" className="full">
            <input className="input" value={meta.tags} onChange={(e) => setMeta({ ...meta, tags: e.target.value })} />
          </Field>
          <Field label="Notes" className="full">
            <input className="input" value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} />
          </Field>
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary sm" onClick={saveMeta}>
              Save details
            </button>
          </div>
        </div>
      )}
      {doc.notes && !editing && <p className="muted" style={{ marginTop: 0 }}>{doc.notes}</p>}
      <div className="doc-preview">
        {error ? (
          <Empty icon={<File size={22} />} title="Couldn't open this file">
            {error}
          </Empty>
        ) : !url ? (
          <div className="faint" style={{ padding: 40, textAlign: 'center' }}>
            Decrypting…
          </div>
        ) : doc.mime.startsWith('image/') ? (
          <img src={url} alt={doc.name} />
        ) : canPreview ? (
          <iframe src={url} title={doc.name} />
        ) : (
          <Empty icon={<DocIcon mime={doc.mime} size={22} />} title="No preview for this file type">
            Download it to open it on your device.
          </Empty>
        )}
      </div>
    </Modal>
  );
}
