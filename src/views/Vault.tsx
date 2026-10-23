import { Copy, Dices, ExternalLink, Eye, EyeOff, KeyRound, Pencil, Search, ShieldAlert, Star, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Ring } from '../components/charts';
import { Empty, Modal, Seg, useCopy } from '../components/ui';
import { relativeTime } from '../lib/dates';
import { breachCount, hostOf, strength, vaultHealth } from '../lib/passwords';
import type { Book, Secret } from '../lib/types';
import { useNav } from '../nav';
import { useVault } from '../store';

type Filter = 'all' | 'favorites' | 'weak' | 'reused' | 'old' | 'breached';

const AVATAR_COLORS = ['#7c6cff', '#16a394', '#d9822b', '#d6455d', '#3b82f6', '#65a30d', '#c026d3', '#0891b2'];
function avatarColor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const STRENGTH_PILL = ['bad', 'bad', 'warn', 'good', 'good'];

export function Vault() {
  const { data, update } = useVault();
  const nav = useNav();
  const copy = useCopy();
  const [q, setQ] = useState('');
  const [book, setBook] = useState<Book | 'all'>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [breaches, setBreaches] = useState<Map<string, number> | null>(null);
  const [askBreach, setAskBreach] = useState(false);
  const [checking, setChecking] = useState<{ done: number; total: number } | null>(null);
  const [breachError, setBreachError] = useState('');

  const health = useMemo(() => vaultHealth(data.secrets), [data.secrets]);
  const sets = useMemo(
    () => ({
      weak: new Set(health.weak.map((s) => s.id)),
      reused: new Set(health.reused.flat().map((s) => s.id)),
      old: new Set(health.old.map((s) => s.id)),
    }),
    [health],
  );

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.secrets
      .filter((s) => book === 'all' || s.book === book)
      .filter((s) => {
        if (filter === 'favorites') return s.favorite;
        if (filter === 'breached') return (breaches?.get(s.id) ?? 0) > 0;
        if (filter !== 'all') return sets[filter].has(s.id);
        return true;
      })
      .filter((s) => !term || `${s.title} ${s.username} ${s.url} ${s.tags.join(' ')} ${s.notes}`.toLowerCase().includes(term))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title));
  }, [data.secrets, q, book, filter, sets, breaches]);

  const toggleShown = (id: string) =>
    setShown((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleFav = (s: Secret) => update((d) => ({ ...d, secrets: d.secrets.map((x) => (x.id === s.id ? { ...x, favorite: !x.favorite } : x)) }));

  const runBreachCheck = async () => {
    setAskBreach(false);
    setBreachError('');
    const targets = data.secrets.filter((s) => s.password);
    const results = new Map<string, number>();
    // Identical passwords only need one lookup.
    const cache = new Map<string, number>();
    setChecking({ done: 0, total: targets.length });
    try {
      for (const [i, s] of targets.entries()) {
        if (!cache.has(s.password)) cache.set(s.password, await breachCount(s.password));
        results.set(s.id, cache.get(s.password)!);
        setChecking({ done: i + 1, total: targets.length });
      }
      setBreaches(results);
      if ([...results.values()].some((n) => n > 0)) setFilter('breached');
    } catch {
      setBreachError("Couldn't reach the breach database. Check your connection and try again.");
    } finally {
      setChecking(null);
    }
  };

  const breachedCount = breaches ? [...breaches.values()].filter((n) => n > 0).length : null;
  const healthColor = health.score >= 80 ? 'var(--income)' : health.score >= 50 ? 'var(--warn)' : 'var(--expense)';

  if (!data.secrets.length) {
    return (
      <div className="card">
        <Empty
          icon={<KeyRound size={22} />}
          title="Keep every login in one encrypted place"
          action={
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => nav.open({ type: 'secret' })}>
                Add a login
              </button>
              <button className="btn" onClick={() => nav.open({ type: 'generator' })}>
                <Dices size={15} /> Generate a password
              </button>
            </div>
          }
        >
          Personal and company logins, kept apart. Kosh flags weak, reused and old passwords, and can check them against known breaches without sending
          them anywhere.
        </Empty>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="health">
          <Ring value={health.score / 100} size={104} color={healthColor}>
            <div>
              <div className="num" style={{ fontSize: 26, fontWeight: 680, letterSpacing: '-0.03em' }}>
                {health.score}
              </div>
              <div className="faint" style={{ fontSize: 11 }}>
                health
              </div>
            </div>
          </Ring>
          <div style={{ minWidth: 0, width: '100%' }}>
            <div className="row between wrap">
              <div>
                <div style={{ fontWeight: 620, fontSize: 15 }}>{health.score >= 80 ? 'Your vault is in good shape' : health.score >= 50 ? 'A few passwords need attention' : 'Several passwords are at risk'}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {health.total} logins · {data.secrets.filter((s) => s.book === 'company').length} company · {data.secrets.filter((s) => s.book === 'personal').length} personal
                </div>
              </div>
              <button className="btn" onClick={() => setAskBreach(true)} disabled={!!checking}>
                <ShieldAlert size={15} />
                {checking ? `Checking ${checking.done}/${checking.total}…` : breaches ? 'Check breaches again' : 'Check for breaches'}
              </button>
            </div>
            <div className="row wrap mt" style={{ gap: 8 }}>
              {(
                [
                  ['weak', health.weak.length, 'weak'],
                  ['reused', sets.reused.size, 'reused'],
                  ['old', health.old.length, 'over a year old'],
                ] as [Filter, number, string][]
              ).map(([f, n, label]) => (
                <button key={f} className={`pill ${n ? (f === 'old' ? 'warn' : 'bad') : 'good'}`} style={{ border: 0, height: 26, padding: '0 10px' }} onClick={() => setFilter(filter === f ? 'all' : f)}>
                  {n} {label}
                </button>
              ))}
              {breachedCount !== null && (
                <button className={`pill ${breachedCount ? 'bad' : 'good'}`} style={{ border: 0, height: 26, padding: '0 10px' }} onClick={() => setFilter(filter === 'breached' ? 'all' : 'breached')}>
                  {breachedCount} found in breaches
                </button>
              )}
            </div>
            {breachError && <div className="error-text mt">{breachError}</div>}
          </div>
        </div>
      </div>

      <div className="toolbar mt">
        <div className="search">
          <Search size={15} />
          <input className="input" placeholder="Search logins…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search logins" />
        </div>
        <Seg
          label="Belongs to"
          value={book}
          onChange={setBook}
          options={[
            { value: 'all', label: 'All' },
            { value: 'personal', label: 'Personal' },
            { value: 'company', label: 'Company' },
          ]}
        />
        <select className="select" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filter">
          <option value="all">Everything</option>
          <option value="favorites">Favourites</option>
          <option value="weak">Weak</option>
          <option value="reused">Reused</option>
          <option value="old">Over a year old</option>
          {breaches && <option value="breached">Found in breaches</option>}
        </select>
        <button className="btn" onClick={() => nav.open({ type: 'generator' })}>
          <Dices size={15} /> Generator
        </button>
      </div>

      <div className="card flush">
        {list.length === 0 && <Empty icon={<Search size={22} />} title="No logins match" />}
        {list.map((s) => {
          const st = strength(s.password);
          const host = hostOf(s.url);
          const isShown = shown.has(s.id);
          const breached = breaches?.get(s.id) ?? 0;
          return (
            <div key={s.id} className="secret">
              <div className="favicon" style={{ background: avatarColor(host || s.title) }}>
                {(s.title || host || '?').charAt(0)}
              </div>
              <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => nav.open({ type: 'secret', initial: s })}>
                <div className="tx-t row" style={{ gap: 8 }}>
                  {s.title}
                  {s.favorite && <Star size={13} fill="var(--gold)" style={{ color: 'var(--gold)', flex: 'none' }} />}
                  <span className={`pill ${s.book}`} style={{ height: 19, fontSize: 10.5 }}>
                    {s.book === 'personal' ? 'Personal' : 'Company'}
                  </span>
                </div>
                <div className="tx-s">
                  {host || 'No website'}
                  {sets.reused.has(s.id) && <span className="pill bad" style={{ height: 18, fontSize: 10.5 }}>Reused</span>}
                  {breached > 0 && <span className="pill bad" style={{ height: 18, fontSize: 10.5 }}>Breached ×{breached.toLocaleString()}</span>}
                  {sets.old.has(s.id) && <span className="faint">changed {relativeTime(s.passwordChangedAt)}</span>}
                </div>
              </div>
              <div className="secret-user tx-s" style={{ fontSize: 13 }}>
                {s.username && (
                  <>
                    <UserRound size={13} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.username}</span>
                  </>
                )}
              </div>
              <div className="secret-pw" style={{ minWidth: 0 }}>
                {isShown ? <div className="pw-shown">{s.password}</div> : <div className="pw-dots">••••••••••••</div>}
                <span className={`pill ${STRENGTH_PILL[st.score]}`} style={{ height: 18, fontSize: 10.5, marginTop: 3 }}>
                  {st.label}
                </span>
              </div>
              <div className="secret-actions">
                <button className="icon-btn" onClick={() => toggleShown(s.id)} aria-label={isShown ? 'Hide password' : 'Show password'} title={isShown ? 'Hide' : 'Show'}>
                  {isShown ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                {s.username && (
                  <button className="icon-btn" onClick={() => copy(s.username, 'Username')} aria-label="Copy username" title="Copy username">
                    <UserRound size={16} />
                  </button>
                )}
                <button className="icon-btn" onClick={() => copy(s.password, 'Password', true)} aria-label="Copy password" title="Copy password">
                  <Copy size={16} />
                </button>
                {s.url && (
                  <a className="icon-btn" href={/^https?:\/\//i.test(s.url) ? s.url : `https://${s.url}`} target="_blank" rel="noopener noreferrer" aria-label="Open website" title="Open website">
                    <ExternalLink size={16} />
                  </a>
                )}
                <button className="icon-btn" onClick={() => toggleFav(s)} aria-label={s.favorite ? 'Remove from favourites' : 'Add to favourites'} title="Favourite">
                  <Star size={16} fill={s.favorite ? 'var(--gold)' : 'none'} style={{ color: s.favorite ? 'var(--gold)' : undefined }} />
                </button>
                <button className="icon-btn" onClick={() => nav.open({ type: 'secret', initial: s })} aria-label="Edit" title="Edit">
                  <Pencil size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {askBreach && (
        <Modal
          title="Check passwords against known breaches?"
          onClose={() => setAskBreach(false)}
          footer={
            <div className="right">
              <button className="btn ghost" onClick={() => setAskBreach(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={runBreachCheck}>
                Check now
              </button>
            </div>
          }
        >
          <div className="stack muted" style={{ fontSize: 13.5 }}>
            <p style={{ margin: 0 }}>
              Kosh looks each password up in <b style={{ color: 'var(--text)' }}>Have I Been Pwned</b>, a public list of more than 900 million leaked
              passwords.
            </p>
            <p style={{ margin: 0 }}>
              Your passwords never leave this device. Kosh hashes each one and sends only the first 5 characters of the hash, which matches hundreds of
              unrelated passwords. The comparison happens here. This is the only time Kosh talks to the internet, and only when you ask.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
