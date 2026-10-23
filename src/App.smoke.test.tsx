// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Boots the real app on the demo data and walks every screen and form,
 * so a runtime crash anywhere in the UI fails CI.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
const errors: unknown[] = [];

beforeAll(async () => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  window.addEventListener('error', (e) => errors.push(e.error));
  vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
  history.replaceState(null, '', '/?demo#overview');

  const [{ default: App }, { VaultProvider }, { ToastProvider }] = await Promise.all([import('./App'), import('./store'), import('./components/ui')]);
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <VaultProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </VaultProvider>,
    );
  });
});

afterAll(() => vi.restoreAllMocks());

const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => (el as HTMLElement).click());
};
const navButton = (label: string) => [...container.querySelectorAll('.side .nav-item')].find((b) => b.textContent?.includes(label));
const closeModal = async () => click(document.querySelector('.modal [aria-label="Close"]'));

describe('app smoke test', () => {
  it('opens the demo on the overview', () => {
    expect(container.textContent).toContain('Lumen Studio');
    expect(container.textContent).toContain('Cash flow');
  });

  it.each([
    ['Transactions', 'Money in'],
    ['Bills', 'Coming up'],
    ['Projects', 'Atlas Banking App'],
    ['You & Company', 'owes you'],
    ['Reports & tax', 'Profit & loss'],
    ['Insights', 'Observations'],
    ['Passwords', 'health'],
    ['Settings', 'Financial year'],
    ['Overview', 'Bills due soon'],
  ])('renders %s', async (label, text) => {
    await click(navButton(label));
    expect(container.querySelector('.top h1')?.textContent).toBe(label);
    expect(container.textContent).toContain(text);
  });

  it('opens every form from the top bar', async () => {
    for (const [screen, title] of [
      ['Overview', 'New entry'],
      ['Bills', 'New recurring bill'],
      ['Projects', 'New project'],
      ['You & Company', 'Move money'],
      ['Passwords', 'New login'],
    ]) {
      await click(navButton(screen));
      await click(container.querySelector('.top .btn.primary'));
      expect(document.querySelector('.modal-h h2')?.textContent).toBe(title);
      await closeModal();
    }
  });

  it('pays a bill and moves it to its next due date', async () => {
    await click(navButton('Bills'));
    const before = container.textContent;
    await click(container.querySelector('[aria-label^="Mark "][aria-label$=" paid"]'));
    expect(document.querySelector('.modal-h h2')?.textContent).toMatch(/^Pay /);
    await click(document.querySelector('.modal .btn.primary'));
    expect(document.querySelector('.modal')).toBeNull();
    expect(container.textContent).not.toBe(before);
  });

  it('opens a project and the command palette', async () => {
    await click(navButton('Projects'));
    await click(container.querySelector('.card.project[role="button"]'));
    expect(document.querySelector('.modal')?.textContent).toContain('Record payment');
    await closeModal();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true })));
    expect(document.querySelector('.palette')).toBeTruthy();
  });

  it('logged no errors', () => {
    expect(errors).toEqual([]);
  });
});
