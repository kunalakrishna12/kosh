// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Safari's "Strong Password" fills new-password fields without firing input events.
 * The lock screen must keep those values when the eye is clicked, and use them on submit.
 */
describe('lock screen with browser-filled passwords', () => {
  it('keeps autofilled values when toggling visibility, and creates the vault with them', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} });
    const create = vi.fn().mockResolvedValue(undefined);
    const store = await import('../store');
    vi.spyOn(store, 'useVault').mockReturnValue({ status: 'new', create } as unknown as ReturnType<typeof store.useVault>);
    const { LockScreen } = await import('./Lock');
    const el = document.createElement('div');
    document.body.appendChild(el);
    await act(async () => createRoot(el).render(<LockScreen theme="dark" setTheme={() => {}} />));

    const [pw, confirm] = el.querySelectorAll('input');
    const strong = 'hwsK-7mPq-xT2a-Lr9d';
    pw.value = strong;
    confirm.value = strong;

    await act(async () => (el.querySelector('[aria-label="Show password"]') as HTMLElement).click());
    const [pw2, confirm2] = el.querySelectorAll('input');
    expect(pw2.type).toBe('text');
    expect(pw2.value).toBe(strong);
    expect(confirm2.value).toBe(strong);

    await act(async () => (el.querySelector('[aria-label="Hide password"]') as HTMLElement).click());
    expect(el.querySelector('input')!.type).toBe('password');

    const submit = el.querySelector('.btn.primary') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    await act(async () => submit.click());
    expect(create).toHaveBeenCalledWith(strong);
  });
});
