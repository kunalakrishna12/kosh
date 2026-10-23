import { ArrowRight, Eye, EyeOff, KeyRound, LineChart, Loader2, LockKeyhole, Moon, ShieldCheck, Sun, Upload, WifiOff } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { BrandMark, isDark } from '../App';
import { StrengthMeter } from '../components/forms';
import { WrongPasswordError } from '../lib/crypto';
import { strength } from '../lib/passwords';
import type { ThemePref } from '../lib/types';
import { useVault } from '../store';

export function LockScreen({ theme, setTheme }: { theme: ThemePref; setTheme: (t: ThemePref) => void }) {
  const { status, create, unlock, startDemo, importBackup, wipe } = useVault();
  const isNew = status === 'new';
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [forgot, setForgot] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dark = isDark(theme);

  const fail = (msg: string) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 450);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (isNew) {
      if (pw.length < 10) return fail('Use at least 10 characters.');
      if (strength(pw).score < 2) return fail('Pick something harder to guess. A short sentence works well.');
      if (pw !== confirm) return fail("The two passwords don't match.");
    }
    setBusy(true);
    try {
      await (isNew ? create(pw) : unlock(pw));
    } catch (err) {
      fail(err instanceof WrongPasswordError ? 'Wrong password. Try again.' : (err as Error).message);
      setBusy(false);
    }
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      await importBackup(f);
      setError('');
      setPw('');
    } catch (err) {
      fail((err as Error).message);
    }
  };

  return (
    <div className="lock">
      <section className="lock-art">
        <div className="row between">
          <div className="brand" style={{ padding: 0 }}>
            <span className="brand-mark">
              <BrandMark />
            </span>
            Kosh
          </div>
          <button className="icon-btn" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label="Toggle theme">
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
        <div>
          <h1 className="lock-title">
            Your money, your company's money, <em>and every password.</em>
          </h1>
          <p className="lock-lede">
            One private vault for founders. Track personal and business spending side by side, see what each project really earns, know what the
            company owes you, and keep your logins safe. All of it encrypted on this device.
          </p>
        </div>
        <div className="lock-points">
          <div className="lock-point">
            <ShieldCheck size={18} />
            <b>Zero-knowledge</b>
            <span>AES-256-GCM. Your password never leaves this device.</span>
          </div>
          <div className="lock-point">
            <WifiOff size={18} />
            <b>No servers</b>
            <span>No account, no tracking, works offline.</span>
          </div>
          <div className="lock-point">
            <LineChart size={18} />
            <b>Real analysis</b>
            <span>Runway, project margins, password health.</span>
          </div>
        </div>
      </section>

      <section className="lock-form">
        <div className={`lock-card ${shake ? 'shake' : ''}`}>
          <div className="vault-ring">{isNew ? <KeyRound size={26} /> : <LockKeyhole size={26} />}</div>
          <h2>{isNew ? 'Create your vault' : 'Welcome back'}</h2>
          <p>{isNew ? 'Choose a master password. It encrypts everything, and it cannot be recovered, so make it memorable.' : 'Enter your master password to unlock.'}</p>

          <form className="stack" onSubmit={submit}>
            <div className="field">
              <span>Master password</span>
              <div className="input-wrap">
                <input
                  className="input"
                  style={{ height: 46 }}
                  type={show ? 'text' : 'password'}
                  value={pw}
                  onChange={(e) => (setPw(e.target.value), setError(''))}
                  autoFocus
                  autoComplete={isNew ? 'new-password' : 'current-password'}
                  aria-invalid={!!error}
                />
                <div className="addons">
                  <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {isNew && <StrengthMeter password={pw} />}
            </div>
            {isNew && (
              <label className="field">
                <span>Confirm password</span>
                <input className="input" style={{ height: 46 }} type={show ? 'text' : 'password'} value={confirm} onChange={(e) => (setConfirm(e.target.value), setError(''))} autoComplete="new-password" />
              </label>
            )}
            {error && (
              <div className="error-text" role="alert">
                {error}
              </div>
            )}
            <button className="btn primary lg block" disabled={busy || !pw}>
              {busy ? <Loader2 size={17} className="spin" /> : null}
              {busy ? (isNew ? 'Creating vault…' : 'Unlocking…') : isNew ? 'Create vault' : 'Unlock'}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>

          <div className="divider">or</div>
          <div className="stack" style={{ gap: 8 }}>
            <button className="btn block" onClick={startDemo}>
              Explore with sample data
            </button>
            <button className="btn ghost block" onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Restore from a backup file
            </button>
            <input ref={fileRef} type="file" accept=".kosh,.json,application/json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
            {!isNew &&
              (forgot ? (
                <div className="card" style={{ background: 'var(--bg-2)', marginTop: 8 }}>
                  <p style={{ margin: '0 0 12px', fontSize: 13 }}>
                    Kosh can't reset your password, because nobody else has it. Restore a backup, or erase this vault and start again. Erasing cannot be undone.
                  </p>
                  <div className="row">
                    <button className="btn danger solid sm" onClick={() => void wipe()}>
                      Erase vault
                    </button>
                    <button className="btn ghost sm" onClick={() => setForgot(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn ghost block sm faint" onClick={() => setForgot(true)}>
                  Forgot password?
                </button>
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}
