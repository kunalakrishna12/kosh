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

  it('shows tinted summary tiles with trends, and corner links to each page', async () => {
    const tiles = container.querySelectorAll('.page .kpi');
    expect(tiles.length).toBe(4);
    expect(tiles[0].querySelector('.kpi-spark svg')).toBeTruthy();
    await click(container.querySelector('.corner[aria-label="All accounts"]'));
    expect(container.querySelector('.top h1')?.textContent).toBe('Accounts & cash');
    expect(container.querySelectorAll('.page .kpi').length).toBe(4);
    await click(navButton('Overview'));
  });

  it('the add button in the phone tab bar opens what fits the page', async () => {
    await click(container.querySelector('.mobile-nav .mobile-add'));
    expect(document.querySelector('.modal #tx-form')).toBeTruthy();
    await closeModal();
    await click(navButton('Passwords'));
    expect(container.querySelector('.mobile-nav .mobile-add')?.getAttribute('aria-label')).toBe('New login');
    await click(navButton('Overview'));
  });

  it.each([
    ['Transactions', 'Money in'],
    ['Accounts & cash', 'Cash in hand'],
    ['Bills', 'Coming up'],
    ['Projects', 'Atlas Banking App'],
    ['You & Company', 'owes you'],
    ['Reports & tax', 'Profit & loss'],
    ['Insights', 'Observations'],
    ['Passwords', 'health'],
    ['Invoices', 'Waiting to be paid'],
    ['Staff & payroll', 'Monthly payroll cost'],
    ['Budgets', 'Safe to spend'],
    ['Documents', 'Expiring soon'],
    ['Settings', 'Company details for invoices'],
    ['Overview', 'Due soon'],
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
      ['Staff & payroll', 'Add a person'],
      ['Budgets', 'New budget'],
      ['Accounts & cash', 'New account'],
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

  it('opens an account, updates its balance and moves cash', async () => {
    await click(navButton('Accounts & cash'));
    const card = [...container.querySelectorAll('.acct-card[role="button"]')].find((c) => c.textContent?.includes('Cash in hand'))!;
    await click(card);
    await click([...document.querySelectorAll('.modal-f .btn')].find((b) => b.textContent?.includes('Update balance')));
    const input = document.querySelector('#value-form input') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, '1234');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(document.querySelector('button[form="value-form"]'));
    expect(document.querySelector('.modal .stat-v')?.textContent).toContain('1,234');
    await closeModal();
    expect(card.textContent).toContain('1,234');
    await click([...container.querySelectorAll('.btn')].find((b) => b.textContent?.includes('Transfer money')));
    expect(document.querySelector('.modal-h h2')?.textContent).toBe('Transfer money');
    await closeModal();
  });

  it('adds a SIP into a new fund and marks it done', async () => {
    await click(navButton('Accounts & cash'));
    await click([...container.querySelectorAll('.btn')].find((b) => b.textContent?.trim() === 'SIP'));
    expect(document.querySelector('.modal-h h2')?.textContent).toBe('New SIP');
    const setValue = async (el: HTMLInputElement, v: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    const inputs = document.querySelectorAll<HTMLInputElement>('#sip-form input');
    await setValue(inputs[0], 'Test Small Cap Fund');
    await setValue(inputs[1], '1500');
    const select = [...document.querySelectorAll<HTMLSelectElement>('#sip-form select')].find((x) => [...x.options].some((o) => o.value === 'new'))!;
    await act(async () => {
      select.value = 'new';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click(document.querySelector('.modal-f .btn.primary'));
    expect(document.querySelector('.modal')).toBeNull();
    expect(container.textContent).toContain('Test Small Cap Fund');
    const row = [...container.querySelectorAll('.sip-row')].find((r) => r.textContent?.includes('Test Small Cap Fund'))!;
    await click([...row.querySelectorAll('.btn')].find((b) => b.textContent?.includes('Done')));
    const fund = [...container.querySelectorAll('.fund-row')].find((r) => r.textContent?.includes('Test Small Cap Fund'))!;
    expect(fund.querySelectorAll('.num')[1].textContent).toBe('₹1,500');
    // Funds are listed once, under Investments, not again among bank accounts.
    expect([...container.querySelectorAll('.acct-card')].some((c) => c.textContent?.includes('Test Small Cap Fund'))).toBe(false);
  });

  it('edits the current value of an existing fund from its row', async () => {
    await click(navButton('Accounts & cash'));
    const row = () => [...container.querySelectorAll('.fund-row')].find((r) => r.textContent?.includes('Test Small Cap Fund'))!;
    await click(row().querySelector('[aria-label^="Update current value"]'));
    const input = document.querySelector('#value-form input') as HTMLInputElement;
    expect(input.value).toBe('1500');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '1650');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(document.querySelector('.modal-f .btn.primary'));
    const cells = row().querySelectorAll('.num');
    expect(cells[0].textContent).toBe('₹1,500');
    expect(cells[1].textContent).toBe('₹1,650');
    expect(cells[2].textContent).toBe('+10.00%+₹150');
  });

  it('warns before an expense goes over budget', async () => {
    await click(navButton('Overview'));
    await act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true })));
    const amount = document.querySelector('.amount-input') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(amount, '500000');
      amount.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.querySelector('.budget-note.over')?.textContent).toContain('monthly budget goes over by');
    expect(document.querySelector('button[form="tx-form"]')?.textContent).toBe('Add anyway');
    await closeModal();
  });

  it('shows and saves the file password of a document', async () => {
    await click(navButton('Documents'));
    const card = (name: string) => [...container.querySelectorAll('.doc-card')].find((c) => c.textContent?.includes(name))!;
    expect(card('e-Aadhaar').textContent).toContain('Password saved');
    await click(card('e-Aadhaar'));
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    const bar = document.querySelector('.doc-pw')!;
    expect(bar.querySelector('code')?.textContent).not.toContain('AARA1995');
    await click(bar.querySelector('[aria-label="Show file password"]'));
    expect(bar.querySelector('code')?.textContent).toBe('AARA1995');
    await closeModal();

    // Add a password to a file that didn't have one.
    await click(card('PAN card'));
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    expect(document.querySelector('.doc-pw')).toBeNull();
    await click([...document.querySelectorAll('.modal-f .btn')].find((b) => b.textContent?.includes('Details')));
    const input = document.querySelector('.modal input[aria-label="File password"]') as HTMLInputElement;
    expect(input.type).toBe('text'); // not a password field, so Safari won't offer to generate one
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'PAN-1995');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click([...document.querySelectorAll('.modal .btn')].find((b) => b.textContent?.includes('Save details')));
    expect(document.querySelector('.doc-pw')).toBeTruthy();
    await closeModal();
    expect(card('PAN card').textContent).toContain('Password saved');
  });

  it('bills in dollars: estimate, pay with the real charge, learn the rate', async () => {
    const setValue = async (el: Element | null, v: string) =>
      act(async () => {
        const input = el as HTMLInputElement | HTMLSelectElement;
        const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, v);
        input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      });
    await click(navButton('Bills'));
    await click(container.querySelector('.top .btn.primary'));
    const form = () => document.querySelector('#bill-form')!;
    await setValue(form().querySelector('input'), 'Claude Pro');
    await setValue(form().querySelector('.cur-select'), 'USD');
    await setValue(form().querySelector('.input-wrap .input.num'), '20');
    const fx = form().querySelector('.fx-box')!;
    await setValue(fx.querySelectorAll('input')[0], '84.12');
    await setValue(fx.querySelectorAll('input')[1], '4.13');
    const paidFrom = [...form().querySelectorAll('.field')].find((f) => f.textContent?.startsWith('Paid from'))!.querySelector('select')!;
    const card = [...paidFrom.options].find((o) => o.textContent?.includes('Company credit card'))!;
    await setValue(paidFrom, card.value);
    expect(fx.querySelector('.fx-sum')?.textContent).toContain('₹1,751.88');
    await click(document.querySelector('button[form="bill-form"]'));
    const row = () => [...container.querySelectorAll('.tx')].find((r) => r.textContent?.includes('Claude Pro') && r.textContent?.includes('/mo'))!;
    expect(row().textContent).toContain('$20.00');
    expect(row().textContent).toContain('≈ ₹1,751.88');

    // Pay it: the statement says ₹1,759.
    await click(row().querySelector('[aria-label="Mark Claude Pro paid"]'));
    expect((document.querySelector('.amount-input') as HTMLInputElement).value).toBe('20');
    // The bill's card is pre-selected in "Paid with".
    expect(document.querySelector('#tx-form .pay-chip.on')?.textContent).toContain('Company credit card');
    const charged = [...document.querySelectorAll('#tx-form .field')].find((f) => f.textContent?.includes('Charged in INR'))!.querySelector('input');
    await setValue(charged, '1759');
    await click(document.querySelector('button[form="tx-form"]'));
    expect(row().textContent).toContain('≈ ₹1,759');
  });

  it('runs the payroll for this month and issues payslips', async () => {
    await click(navButton('Staff & payroll'));
    await click([...container.querySelectorAll('.btn')].find((b) => b.textContent?.includes('Run payroll')));
    const rows = () => [...document.querySelectorAll('.payroll-row:not(.payroll-head):not(.payroll-total)')];
    expect(rows().length).toBeGreaterThan(3);
    const first = rows()[0];
    const netBefore = first.querySelector('b.num')!.textContent;
    const lop = first.querySelector('input[aria-label^="Loss of pay"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(lop, '2');
      lop.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rows()[0].querySelector('b.num')!.textContent).not.toBe(netBefore);
    await click([...document.querySelectorAll('.modal-f .btn.primary')].find((b) => b.textContent?.includes('Pay ₹')));
    expect(document.querySelector('.modal')?.textContent).toContain('adds these deposits to Bills');
    await click([...document.querySelectorAll('.modal .btn')].find((b) => b.textContent?.includes('Confirm and pay')));
    expect(document.querySelector('.modal')).toBeNull();
    expect(container.textContent).toContain('Paid');

    // The payslip, from the person's page.
    await click(container.querySelectorAll('.card.flush .tx')[0]);
    await click(document.querySelector('.modal .card.flush .tx'));
    expect(document.querySelector('.paper')?.textContent).toContain('PAYSLIP');
    expect(document.querySelector('.paper')?.textContent).toContain('Net pay');
    await closeModal();

    // Government deposits now wait in Bills.
    await click(navButton('Bills'));
    expect(container.textContent).toContain('TDS on salaries');
    expect(container.textContent).toContain('PF & ESI contributions');
  });

  it('transfers bank to cash, and company bank to personal cash', async () => {
    const setValue = async (el: Element | null, v: string) =>
      act(async () => {
        const input = el as HTMLInputElement | HTMLSelectElement;
        const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, v);
        input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      });
    const card = (name: string) => [...container.querySelectorAll('.acct-card')].find((c) => c.querySelector('.tx-t')?.textContent === name)!;
    const balance = (name: string) => card(name).querySelector('.stat-v')!.textContent;

    // Personal bank → personal cash: "Withdraw cash" from the bank's page.
    await click(navButton('Accounts & cash'));
    const cashBefore = balance('Cash in hand');
    await click(card('HDFC Savings'));
    await click([...document.querySelectorAll('.modal-f .btn')].find((b) => b.textContent?.includes('Withdraw cash')));
    const form = () => document.querySelector('#move-form')!;
    expect((form().querySelectorAll('select')[1] as HTMLSelectElement).selectedOptions[0].textContent).toContain('Cash in hand');
    await setValue(form().querySelector('.input.num'), '2000');
    await click(document.querySelector('button[form="move-form"]'));
    await closeModal();
    expect(balance('Cash in hand')).not.toBe(cashBefore);

    // Company bank → personal cash: Kosh asks what it is and records it under You & Company.
    await click(container.querySelector('.top .btn.primary'));
    await closeModal();
    await click([...container.querySelectorAll('.btn')].find((b) => b.textContent?.includes('Transfer money')));
    const selects = () => form().querySelectorAll('select');
    const option = (sel: Element, text: string) => [...(sel as HTMLSelectElement).options].find((o) => o.textContent?.startsWith(text))!.value;
    await setValue(selects()[0], option(selects()[0], 'HDFC Current'));
    await setValue(selects()[1], option(selects()[1], 'Cash in hand'));
    expect(form().textContent).toContain('what is it?');
    await setValue(selects()[2], 'reimbursement');
    await setValue(form().querySelector('.input.num'), '1500');
    await click(document.querySelector('button[form="move-form"]'));
    await click(navButton('You & Company'));
    expect(container.textContent).toContain('Reimbursement');
    expect(container.textContent).toContain('HDFC Current → Cash in hand');
  });

  it('new entry has a Transfer tab', async () => {
    await click(navButton('Overview'));
    await click(container.querySelector('.top .btn.primary'));
    await click([...document.querySelectorAll('.modal .seg button')].find((b) => b.textContent?.includes('Transfer')));
    expect(document.querySelector('.modal-h h2')?.textContent).toBe('Transfer money');
    await closeModal();
  });

  it('cash is an option on expenses and income, and moves the cash balance', async () => {
    const setValue = async (el: Element | null, v: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
        (el as HTMLInputElement).dispatchEvent(new Event('input', { bubbles: true }));
      });
    await click(navButton('Accounts & cash'));
    const cashCard = () => [...container.querySelectorAll('.acct-card')].find((c) => c.querySelector('.tx-t')?.textContent === 'Cash in hand')!;
    const before = cashCard().querySelector('.stat-v')!.textContent;
    await click(container.querySelector('.top .btn.primary'));
    await closeModal();
    await act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true })));
    const chips = () => [...document.querySelectorAll('#tx-form .pay-chip')];
    expect(chips()[0].textContent).toContain('Cash'); // Cash comes first
    await click(chips()[0]);
    await setValue(document.querySelector('.amount-input'), '250');
    expect(document.querySelector('#tx-form')?.textContent).toMatch(/Cash after this: ₹/);
    await click(document.querySelector('button[form="tx-form"]'));
    expect(cashCard().querySelector('.stat-v')!.textContent).not.toBe(before);
  });

  it('dates use the Kosh calendar, not the browser picker', async () => {
    expect(document.querySelectorAll('input[type="date"]').length).toBe(0);
    await click(navButton('Overview'));
    await act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true })));
    await click(document.querySelector('#tx-form .date-btn'));
    expect(document.querySelector('.cal')).toBeTruthy();
    const days = [...document.querySelectorAll('.cal-day:not(.out)')];
    await click(days[0]); // the 1st of this month
    expect(document.querySelector('.cal')).toBeNull();
    expect(document.querySelector('#tx-form .date-btn')?.textContent).toMatch(/^\w{3}, 1 \w{3} \d{4}$/);
    // Escape closes the calendar but not the form.
    await click(document.querySelector('#tx-form .date-btn'));
    await act(async () => document.querySelector('.cal-day[tabindex="0"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('.cal')).toBeNull();
    expect(document.querySelector('#tx-form')).toBeTruthy();
    await closeModal();
  });

  it('logged no errors', () => {
    expect(errors).toEqual([]);
  });
});
