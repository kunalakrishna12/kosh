import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isSealedVault, newVaultKey, seal, unseal, type SealedVault, type VaultKey } from './lib/crypto';
import { demoVault } from './lib/demo';
import { moneyFormat, type MoneyFormat } from './lib/money';
import { deleteSealed, loadSealed, saveSealed } from './lib/storage';
import { emptyVault, type VaultData } from './lib/types';

export type Status = 'loading' | 'new' | 'locked' | 'open';
export type SaveState = 'saved' | 'saving' | 'error';

interface Vault {
  status: Status;
  demo: boolean;
  data: VaultData;
  money: MoneyFormat;
  saveState: SaveState;
  create(password: string, seed?: VaultData): Promise<void>;
  unlock(password: string): Promise<void>;
  lock(): void;
  startDemo(): void;
  update(fn: (d: VaultData) => VaultData): void;
  /** Re-encrypts everything under a new password (fresh salt). */
  changePassword(current: string, next: string): Promise<void>;
  exportBackup(): Promise<Blob>;
  /** Replaces the stored vault with a backup file. The backup's own password opens it. */
  importBackup(file: File): Promise<void>;
  wipe(): Promise<void>;
}

const Ctx = createContext<Vault | null>(null);

/** Older vaults may miss fields added later; fill them from the defaults. */
function migrate(d: VaultData): VaultData {
  const base = emptyVault();
  return { ...base, ...d, settings: { ...base.settings, ...d.settings, openingBalance: { ...base.settings.openingBalance, ...d.settings?.openingBalance } } };
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [demo, setDemo] = useState(false);
  const [data, setData] = useState<VaultData>(emptyVault);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const vk = useRef<VaultKey | null>(null);
  const dirty = useRef(false);
  const timer = useRef<number>();

  useEffect(() => {
    // ?demo opens sample data straight away: handy for "try it" links and screenshots.
    if (new URLSearchParams(location.search).has('demo')) {
      vk.current = null;
      setDemo(true);
      setData(demoVault());
      setStatus('open');
      return;
    }
    loadSealed()
      .then((s) => setStatus(s ? 'locked' : 'new'))
      .catch(() => setStatus('new'));
  }, []);

  const persist = useCallback(async (d: VaultData) => {
    if (!vk.current) return;
    setSaveState('saving');
    try {
      await saveSealed(await seal(vk.current, d));
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, []);

  // Debounced encrypted save after every change.
  const latest = useRef(data);
  latest.current = data;
  useEffect(() => {
    if (status !== 'open' || demo || !dirty.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      dirty.current = false;
      void persist(latest.current);
    }, 350);
  }, [data, status, demo, persist]);

  const open = (d: VaultData, key: VaultKey | null, isDemo: boolean) => {
    vk.current = key;
    dirty.current = false;
    setDemo(isDemo);
    setData(migrate(d));
    setSaveState('saved');
    setStatus('open');
  };

  const value = useMemo<Vault>(() => {
    const flushAndForget = () => {
      window.clearTimeout(timer.current);
      if (dirty.current && vk.current && !demo) {
        const key = vk.current;
        void seal(key, latest.current).then(saveSealed);
      }
      dirty.current = false;
      vk.current = null;
    };
    return {
      status,
      demo,
      data,
      money: moneyFormat(data.settings.currency, data.settings.locale),
      saveState,
      async create(password, seed) {
        const key = await newVaultKey(password);
        const d = seed ?? emptyVault();
        await saveSealed(await seal(key, d));
        open(d, key, false);
      },
      async unlock(password) {
        const sealed = await loadSealed();
        if (!sealed) throw new Error('No vault found on this device.');
        const { data: d, vk: key } = await unseal<VaultData>(sealed, password);
        open(d, key, false);
      },
      lock() {
        flushAndForget();
        setData(emptyVault());
        setDemo(false);
        void loadSealed().then((s) => setStatus(s ? 'locked' : 'new'));
      },
      startDemo() {
        open(demoVault(), null, true);
      },
      update(fn) {
        dirty.current = true;
        setData((d) => fn(d));
      },
      async changePassword(current, next) {
        const sealed = await loadSealed();
        if (!sealed || !vk.current) throw new Error('Vault is not open.');
        await unseal<VaultData>(sealed, current);
        const key = await newVaultKey(next);
        await saveSealed(await seal(key, latest.current));
        vk.current = key;
        dirty.current = false;
      },
      async exportBackup() {
        if (!vk.current) throw new Error('Demo data cannot be backed up.');
        const sealed = await seal(vk.current, latest.current);
        return new Blob([JSON.stringify(sealed, null, 2)], { type: 'application/json' });
      },
      async importBackup(file) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(await file.text());
        } catch {
          throw new Error('That file is not a Kosh backup.');
        }
        if (!isSealedVault(parsed)) throw new Error('That file is not a Kosh backup.');
        flushAndForget();
        await saveSealed(parsed as SealedVault);
        setData(emptyVault());
        setDemo(false);
        setStatus('locked');
      },
      async wipe() {
        flushAndForget();
        await deleteSealed();
        setData(emptyVault());
        setDemo(false);
        setStatus('new');
      },
    };
  }, [status, demo, data, saveState]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVault(): Vault {
  const v = useContext(Ctx);
  if (!v) throw new Error('useVault outside VaultProvider');
  return v;
}
