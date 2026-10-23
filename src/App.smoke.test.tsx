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
  URL.createObjectURL = () => 'blob:mock';
  URL.revokeObjectURL = () => {};
  // jsdom's Blob lacks text(), which every browser has.
  Blob.prototype.text ??= function (this: Blob) {
    return new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.readAsText(this);
    });
  };
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
    ['Invoices', 'Waiting to be paid'],
    ['Budgets', 'Budgeted'],
    ['Documents', 'Expiring soon'],
    ['Settings', 'Company details for invoices'],
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
      ['Invoices', 'New invoice'],
      ['Budgets', 'New budget'],
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

  it('views an invoice and records its payment', async () => {
    await click(navButton('Invoices'));
    await click(container.querySelector('.tx'));
    expect(document.querySelector('.paper')?.textContent).toContain('TAX INVOICE');
    await closeModal();
    const before = container.querySelectorAll('[aria-label="Mark paid"]').length;
    await click(container.querySelector('[aria-label="Mark paid"]'));
    await click(document.querySelector('.modal .btn.primary'));
    expect(container.querySelectorAll('[aria-label="Mark paid"]').length).toBe(before - 1);
  });

  it('imports the sample bank statement', async () => {
    await click(navButton('Transactions'));
    const before = container.textContent!.match(/(\d+) entries/)![1];
    await click([...container.querySelectorAll('.toolbar .btn')].find((b) => b.textContent?.includes('Import')));
    await click([...document.querySelectorAll('.modal .btn')].find((b) => b.textContent?.includes('sample')));
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(document.querySelectorAll('.import-row:not(.import-head)').length).toBeGreaterThan(5);
    await click([...document.querySelectorAll('.modal-f .btn.primary')].find((b) => b.textContent?.includes('Import')));
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(document.querySelector('.modal')).toBeNull();
    expect(Number(container.textContent!.match(/(\d+) entries/)![1])).toBeGreaterThan(Number(before));
  });

  it('opens a document preview', async () => {
    await click(navButton('Documents'));
    await click(container.querySelector('.doc-card'));
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(document.querySelector('.doc-preview iframe')).toBeTruthy();
    await closeModal();
  });

  it('logged no errors', () => {
    expect(errors).toEqual([]);
  });
});
