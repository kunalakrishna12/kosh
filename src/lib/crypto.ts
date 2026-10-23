/**
 * Everything Kosh stores is one sealed blob:
 *
 *   master password ──PBKDF2-SHA256 (600k rounds, random salt)──▶ AES-256-GCM key
 *   JSON of the whole vault ──AES-256-GCM (fresh 96-bit IV per save)──▶ ciphertext
 *
 * The key is non-extractable and lives only in memory while the vault is open.
 * The password is never stored anywhere.
 */

export const FORMAT = 'kosh-vault';
export const DEFAULT_ITERATIONS = 600_000;
const AAD = new TextEncoder().encode('kosh-vault:v1');

export interface SealedVault {
  format: typeof FORMAT;
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  iv: string;
  ct: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super('That password does not open this vault.');
  }
}

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface VaultKey {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
}

export async function newVaultKey(password: string, iterations = DEFAULT_ITERATIONS): Promise<VaultKey> {
  const salt = randomBytes(16);
  return { key: await deriveKey(password, salt, iterations), salt, iterations };
}

export async function seal(vk: VaultKey, data: unknown): Promise<SealedVault> {
  const iv = randomBytes(12);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, vk.key, plain));
  return {
    format: FORMAT,
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: vk.iterations, salt: toB64(vk.salt) },
    iv: toB64(iv),
    ct: toB64(ct),
  };
}

export async function unsealWithKey<T>(sealed: SealedVault, key: CryptoKey): Promise<T> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(sealed.iv), additionalData: AAD },
      key,
      fromB64(sealed.ct),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    throw new WrongPasswordError();
  }
}

export async function unseal<T>(sealed: SealedVault, password: string): Promise<{ data: T; vk: VaultKey }> {
  const salt = fromB64(sealed.kdf.salt);
  const key = await deriveKey(password, salt, sealed.kdf.iterations);
  const data = await unsealWithKey<T>(sealed, key);
  return { data, vk: { key, salt, iterations: sealed.kdf.iterations } };
}

export function isSealedVault(x: unknown): x is SealedVault {
  const s = x as SealedVault;
  return (
    !!s &&
    s.format === FORMAT &&
    s.v === 1 &&
    typeof s.iv === 'string' &&
    typeof s.ct === 'string' &&
    typeof s.kdf?.salt === 'string' &&
    Number.isInteger(s.kdf?.iterations) &&
    s.kdf.iterations >= 100_000
  );
}
