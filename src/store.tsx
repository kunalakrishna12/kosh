import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fromB64, isBackup, isSealedVault, newVaultKey, seal, sealBytes, toB64, unseal, unsealBytes, type Backup, type SealedVault, type VaultKey } from './lib/crypto';
import { demoDocBlob, demoVault } from './lib/demo';
import { moneyFormat, type MoneyFormat } from './lib/money';
import { deleteAllDocs, deleteDoc, deleteSealed, loadDoc, loadSealed, saveDoc, saveSealed } from './lib/storage';
import { emptyVault, type Doc, type VaultData } from './lib/types';

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
  /** Encrypts a file into the document vault. */
  addDoc(file: File, meta: Omit<Doc, 'id' | 'name' | 'mime' | 'size' | 'createdAt'> & { name?: string }): Promise<Doc>;
  /** Decrypts a stored file. */
  openDoc(doc: Doc): Promise<Blob>;
  removeDoc(id: string): Promise<void>;
}

export const MAX_DOC_BYTES = 25 * 1024 * 1024;

const Ctx = createContext<Vault | null>(null);

/** Older vaults may miss fields added later; fill them from the defaults. */
function migrate(d: VaultData): VaultData {
  const base = emptyVault();
  return {
    ...base,
    ...d,
    settings: {
      ...base.settings,
      ...d.settings,
      openingBalance: { ...base.settings.openingBalance, ...d.settings?.openingBalance },
      company: { ...base.settings.company, ...d.settings?.company },
      monthlyBudget: { ...base.settings.monthlyBudget, ...d.settings?.monthlyBudget },
    },
  };
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [demo, setDemo] = useState(false);
  const [data, setData] = useState<VaultData>(emptyVault);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const vk = useRef<VaultKey | null>(null);
  const dirty = useRef(false);
  const timer = useRef<number>();
  // Files added during the demo live only in memory.
  const demoFiles = useRef(new Map<string, Blob>());

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
        const old = vk.current;
        if (!sealed || !old) throw new Error('Vault is not open.');
        await unseal<VaultData>(sealed, current);
        const key = await newVaultKey(next);
        // Re-encrypt every document under the new key before switching the vault over.
        for (const doc of latest.current.docs) {
          const stored = await loadDoc(doc.id);
          if (stored) await saveDoc(doc.id, await sealBytes(key.key, doc.id, await unsealBytes(old.key, doc.id, stored)));
        }
        await saveSealed(await seal(key, latest.current));
        vk.current = key;
        dirty.current = false;
      },
      async exportBackup() {
        if (!vk.current) throw new Error('Demo data cannot be backed up.');
        const docs: Backup['docs'] = {};
        for (const doc of latest.current.docs) {
          const stored = await loadDoc(doc.id);
          if (stored) docs[doc.id] = { iv: toB64(stored.iv), ct: toB64(new Uint8Array(stored.ct)) };
        }
        const backup: Backup = { format: 'kosh-backup', v: 2, vault: await seal(vk.current, latest.current), docs };
        return new Blob([JSON.stringify(backup)], { type: 'application/json' });
      },
      async importBackup(file) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(await file.text());
        } catch {
          throw new Error('That file is not a Kosh backup.');
        }
        // v1 backups are a bare sealed vault; v2 adds documents.
        if (!isSealedVault(parsed) && !isBackup(parsed)) throw new Error('That file is not a Kosh backup.');
        flushAndForget();
        await deleteAllDocs();
        if (isBackup(parsed)) {
          for (const [id, d] of Object.entries(parsed.docs)) {
            const ct = fromB64(d.ct);
            await saveDoc(id, { iv: fromB64(d.iv), ct: ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength) as ArrayBuffer });
          }
          await saveSealed(parsed.vault);
        } else {
          await saveSealed(parsed as SealedVault);
        }
        setData(emptyVault());
        setDemo(false);
        setStatus('locked');
      },
      async wipe() {
        flushAndForget();
        await deleteAllDocs();
        await deleteSealed();
        setData(emptyVault());
        setDemo(false);
        setStatus('new');
      },
      async addDoc(file, meta) {
        if (file.size > MAX_DOC_BYTES) throw new Error(`${file.name} is larger than 25 MB.`);
        const doc: Doc = { ...meta, id: crypto.randomUUID(), name: meta.name || file.name, mime: file.type || 'application/octet-stream', size: file.size, createdAt: Date.now() };
        if (demo) demoFiles.current.set(doc.id, file);
        else {
          if (!vk.current) throw new Error('Vault is locked.');
          await saveDoc(doc.id, await sealBytes(vk.current.key, doc.id, await file.arrayBuffer()));
        }
        dirty.current = true;
        setData((d) => ({ ...d, docs: [doc, ...d.docs] }));
        return doc;
      },
      async openDoc(doc) {
        if (demo) return demoFiles.current.get(doc.id) ?? demoDocBlob(doc);
        if (!vk.current) throw new Error('Vault is locked.');
        const stored = await loadDoc(doc.id);
        if (!stored) throw new Error('This file is missing from this device.');
        return new Blob([await unsealBytes(vk.current.key, doc.id, stored)], { type: doc.mime });
      },
      async removeDoc(id) {
        if (demo) demoFiles.current.delete(id);
        else await deleteDoc(id);
        dirty.current = true;
        setData((d) => ({ ...d, docs: d.docs.filter((x) => x.id !== id) }));
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
