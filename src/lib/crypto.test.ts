import { describe, expect, it } from 'vitest';
import { isSealedVault, newVaultKey, seal, unseal, unsealWithKey, WrongPasswordError } from './crypto';

// Low iteration count keeps tests fast; production uses DEFAULT_ITERATIONS.
const ITER = 1_000;

describe('vault encryption', () => {
  it('round-trips data with the right password', async () => {
    const vk = await newVaultKey('correct horse battery staple', ITER);
    const sealed = await seal(vk, { hello: 'world', n: 42 });
    const { data } = await unseal<{ hello: string; n: number }>(sealed, 'correct horse battery staple');
    expect(data).toEqual({ hello: 'world', n: 42 });
  });

  it('rejects the wrong password', async () => {
    const vk = await newVaultKey('right password', ITER);
    const sealed = await seal(vk, { secret: true });
    await expect(unseal(sealed, 'wrong password')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('never stores plaintext and uses a fresh IV per save', async () => {
    const vk = await newVaultKey('pw', ITER);
    const a = await seal(vk, { note: 'my-bank-pin-4821' });
    const b = await seal(vk, { note: 'my-bank-pin-4821' });
    expect(JSON.stringify(a)).not.toContain('4821');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('detects tampering', async () => {
    const vk = await newVaultKey('pw', ITER);
    const sealed = await seal(vk, { amount: 100 });
    const bytes = Uint8Array.from(atob(sealed.ct), (c) => c.charCodeAt(0));
    bytes[0] ^= 1;
    const tampered = { ...sealed, ct: btoa(String.fromCharCode(...bytes)) };
    await expect(unsealWithKey(tampered, vk.key)).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('treats unicode passwords consistently', async () => {
    const vk = await newVaultKey('café', ITER);
    const sealed = await seal(vk, 1);
    // Same text, different Unicode composition.
    await expect(unseal(sealed, 'café')).resolves.toBeTruthy();
  });

  it('validates backup files', async () => {
    const sealed = await seal(await newVaultKey('pw', 100_000), {});
    expect(isSealedVault(sealed)).toBe(true);
    expect(isSealedVault({ ...sealed, kdf: { ...sealed.kdf, iterations: 10 } })).toBe(false);
    expect(isSealedVault({ hello: 'world' })).toBe(false);
  });
});
