import type { SealedVault } from './crypto';

/** A tiny IndexedDB key-value store. Only the sealed (encrypted) vault is ever written here. */

const DB_NAME = 'kosh';
const STORE = 'kv';
const VAULT_KEY = 'vault';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const loadSealed = () => run<SealedVault | undefined>('readonly', (s) => s.get(VAULT_KEY));
export const saveSealed = (v: SealedVault) => run<void>('readwrite', (s) => s.put(v, VAULT_KEY));
export const deleteSealed = () => run<void>('readwrite', (s) => s.delete(VAULT_KEY));

/** Non-secret UI preferences that must be known before the vault is unlocked. */
export const prefs = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`kosh:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(`kosh:${key}`, value);
    } catch {
      /* private mode */
    }
  },
};
