import { addDays, lastMonths, today } from './dates';
import { advance } from './bills';
import type { Bill, BillFrequency, BillKind, Book, Doc, DocFolder, Invoice, InvoiceItem, Project, Secret, Transaction, Transfer, VaultData } from './types';
import { emptyVault, PROJECT_COLORS } from './types';

/** A believable year of a founder's money and logins, for the demo and for screenshots. */

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoVault(): VaultData {
  const r = rng(42);
  const between = (lo: number, hi: number) => Math.round((lo + r() * (hi - lo)) / 10) * 10 * 100;
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  let n = 0;
  const id = () => `demo-${++n}`;
  const now = Date.now();

  const v = emptyVault();
  v.settings.ownerName = 'Aarav';
  v.settings.companyName = 'Lumen Studio';
  v.settings.openingBalance = { personal: 18_50_000_00, company: 0 };

  const months = lastMonths(12);
  const end = today();
  const day = (m: string, d: number) => {
    const iso = `${m}-${String(Math.min(d, 28)).padStart(2, '0')}`;
    return iso > end ? null : iso;
  };

  const plan = [
    { name: 'Atlas Banking App', client: 'Atlas Bank', contract: 28_00_000_00, budget: 16_00_000_00, status: 'active' as const, start: 1, dur: 14 },
    { name: 'Monsoon Retail Rebrand', client: 'Monsoon Retail', contract: 9_50_000_00, budget: 5_80_000_00, status: 'done' as const, start: 0, dur: 6 },
    { name: 'Kite Logistics Portal', client: 'Kite Logistics', contract: 14_00_000_00, budget: 9_00_000_00, status: 'active' as const, start: 5, dur: 8 },
    { name: 'Saffron Health Pilot', client: 'Saffron Health', contract: 6_00_000_00, budget: 3_20_000_00, status: 'active' as const, start: 8, dur: 6 },
  ];
  const projects: Project[] = plan.map((p, i) => ({
    id: id(),
    name: p.name,
    client: p.client,
    contract: p.contract,
    budget: p.budget,
    status: p.status,
    color: PROJECT_COLORS[i],
    startDate: `${months[p.start]}-03`,
    createdAt: now,
  }));

  const tx: Transaction[] = [];
  const add = (t: Omit<Transaction, 'id' | 'createdAt'>) => tx.push({ ...t, id: id(), createdAt: now - tx.length });
  const tr: Transfer[] = [];
  const move = (t: Omit<Transfer, 'id' | 'createdAt'>) => tr.push({ ...t, id: id(), createdAt: now - tr.length });

  move({ reason: 'capital', amount: 10_00_000_00, date: `${months[0]}-01`, note: 'Founding capital' });
  move({ reason: 'loan', amount: 4_00_000_00, date: `${months[3]}-12`, note: 'Bridge before Atlas milestone' });
  const repayDay = day(months[9], 18);
  if (repayDay) move({ reason: 'repayment', amount: 1_50_000_00, date: repayDay, note: 'Part repayment' });

  months.forEach((m, mi) => {
    const d = (x: number) => day(m, x);
    const push = (date: string | null, t: Omit<Transaction, 'id' | 'createdAt' | 'date'>) => date && add({ ...t, date });

    // Company: fixed costs
    push(d(1), { book: 'company', kind: 'expense', amount: 1_20_000_00 + mi * 6_000_00, category: 'Payroll', note: 'Team salaries' });
    if (mi % 2 === 0) push(d(11), { book: 'company', kind: 'expense', amount: between(20_000, 60_000), category: 'Marketing', note: pick(['LinkedIn ads', 'Design conference booth', 'Case study video']) });
    if (mi === 4) push(d(9), { book: 'company', kind: 'expense', amount: 1_85_000_00, category: 'Equipment', note: 'MacBook Pros ×2', paidPersonally: true });
    if (mi % 4 === 2) push(d(16), { book: 'company', kind: 'expense', amount: between(12_000, 28_000), category: 'Travel', note: 'Client visit — Bengaluru', paidPersonally: mi === 6 });

    // Company: projects
    projects.forEach((p, pi) => {
      const { start, dur } = plan[pi];
      if (mi < start || mi >= start + dur) return;
      const spend = Math.round(p.budget / dur / 100_000) * 100_000 + between(-6000, 6000);
      push(d(14), { book: 'company', kind: 'expense', amount: spend, category: 'Contractors', note: `${p.name} — contractors`, projectId: p.id, taxRate: 18 });
      if ((mi - start) % 2 === 1) {
        const milestone = Math.round(p.contract / (dur / 2) / 10_000_00) * 10_000_00;
        push(d(24), { book: 'company', kind: 'income', amount: milestone, category: 'Client payment', note: `${p.client} — milestone`, projectId: p.id, taxRate: 18 });
      }
    });
    if (mi >= 2) push(d(27), { book: 'company', kind: 'income', amount: 2_50_000_00, category: 'Retainer', note: 'Design retainer — Pebble', taxRate: 18 });
    // A small product that grows month over month.
    if (mi >= 1) push(d(28), { book: 'company', kind: 'income', amount: Math.round((60_000 * Math.pow(1.22, mi - 1)) / 1000) * 1000 * 100, category: 'Product sales', note: 'Lumen Forms subscriptions', taxRate: 18 });

    // You ↔ company
    const sal = d(1);
    if (sal) move({ reason: 'salary', amount: 1_80_000_00, date: sal, note: 'Monthly salary' });

    // Personal
    push(d(5), { book: 'personal', kind: 'expense', amount: 15_000_00, category: 'Investments', note: 'Index fund SIP' });
    for (const x of [6, 13, 20, 26]) push(d(x), { book: 'personal', kind: 'expense', amount: between(2_400, 4_600), category: 'Groceries', note: pick(['BigBasket', 'Ratnadeep', 'Zepto']) });
    for (const x of [9, 17, 23]) push(d(x), { book: 'personal', kind: 'expense', amount: between(1_200, mi > 9 ? 6_800 : 3_600), category: 'Dining', note: pick(['Dinner with friends', 'Swiggy', 'Café', 'Team lunch']) });
    push(d(19), { book: 'personal', kind: 'expense', amount: between(8_000, 14_000), category: 'Family', note: 'Sent home' });
    if (mi % 3 === 0) push(d(21), { book: 'personal', kind: 'expense', amount: between(6_000, 30_000), category: 'Shopping', note: pick(['Shoes', 'Headphones', 'Clothes']) });
    if (mi === 7) push(d(10), { book: 'personal', kind: 'expense', amount: 68_000_00, category: 'Travel', note: 'Goa trip' });
    if (mi === 5) push(d(15), { book: 'personal', kind: 'expense', amount: 12_500_00, category: 'Health', note: 'Annual check-up' });
    if (mi % 6 === 2) push(d(25), { book: 'personal', kind: 'income', amount: between(4_000, 9_000), category: 'Interest', note: 'Savings interest' });
  });


  // Recurring bills, with a year of payment history generated from them.
  const billPlan: {
    book: Book; name: string; vendor: string; kind: BillKind; category: string; amount: number; frequency: BillFrequency;
    day: number; variable?: boolean; growth?: number; taxRate?: number; autopay?: boolean; unpaidLast?: boolean; startMonth?: number;
  }[] = [
    { book: 'company', name: 'AWS', vendor: 'Amazon Web Services', kind: 'cloud', category: 'Cloud', amount: 22_000_00, frequency: 'monthly', day: 3, variable: true, growth: 0.06, taxRate: 18, autopay: true },
    { book: 'company', name: 'OpenAI API', vendor: 'OpenAI', kind: 'api', category: 'APIs', amount: 6_500_00, frequency: 'monthly', day: 2, variable: true, growth: 0.14, autopay: true, startMonth: 4 },
    { book: 'company', name: 'Twilio SMS', vendor: 'Twilio', kind: 'api', category: 'APIs', amount: 3_200_00, frequency: 'monthly', day: 6, variable: true, growth: 0.02, autopay: true, startMonth: 2 },
    { book: 'company', name: 'Vercel Pro', vendor: 'Vercel', kind: 'cloud', category: 'Cloud', amount: 4_200_00, frequency: 'monthly', day: 9, autopay: true },
    { book: 'company', name: 'Google Workspace', vendor: 'Google', kind: 'saas', category: 'Software', amount: 5_040_00, frequency: 'monthly', day: 1, taxRate: 18, autopay: true },
    { book: 'company', name: 'Figma Organization', vendor: 'Figma', kind: 'saas', category: 'Software', amount: 9_800_00, frequency: 'monthly', day: 12, autopay: true },
    { book: 'company', name: 'GitHub Team', vendor: 'GitHub', kind: 'saas', category: 'Software', amount: 2_100_00, frequency: 'monthly', day: 15, autopay: true },
    { book: 'company', name: 'Co-working seats', vendor: 'WeWork', kind: 'rent', category: 'Rent', amount: 45_000_00, frequency: 'monthly', day: 5, taxRate: 18 },
    { book: 'company', name: 'Office broadband', vendor: 'ACT Fibernet', kind: 'utility', category: 'Utilities', amount: 2_360_00, frequency: 'monthly', day: 10, taxRate: 18, unpaidLast: true },
    { book: 'company', name: 'CA retainer + GST filing', vendor: 'Rao & Associates', kind: 'tax', category: 'Legal & Tax', amount: 35_400_00, frequency: 'quarterly', day: 20, taxRate: 18, startMonth: 1 },
    { book: 'company', name: 'Business insurance', vendor: 'ICICI Lombard', kind: 'insurance', category: 'Insurance', amount: 48_000_00, frequency: 'yearly', day: 18, taxRate: 18, startMonth: 0 },
    { book: 'personal', name: 'Apartment rent', vendor: 'Landlord', kind: 'rent', category: 'Rent', amount: 42_000_00, frequency: 'monthly', day: 3 },
    { book: 'personal', name: 'Electricity', vendor: 'TSSPDCL', kind: 'utility', category: 'Utilities', amount: 2_800_00, frequency: 'monthly', day: 8, variable: true, growth: 0.01 },
    { book: 'personal', name: 'Phone + internet', vendor: 'Jio', kind: 'utility', category: 'Utilities', amount: 1_299_00, frequency: 'monthly', day: 11, autopay: true },
    { book: 'personal', name: 'Netflix', vendor: 'Netflix', kind: 'saas', category: 'Subscriptions', amount: 649_00, frequency: 'monthly', day: 12, autopay: true },
    { book: 'personal', name: 'Spotify', vendor: 'Spotify', kind: 'saas', category: 'Subscriptions', amount: 119_00, frequency: 'monthly', day: 14, autopay: true },
    { book: 'personal', name: 'Gym', vendor: 'Cult.fit', kind: 'other', category: 'Health', amount: 2_500_00, frequency: 'monthly', day: 4 },
    { book: 'personal', name: 'Health insurance', vendor: 'Star Health', kind: 'insurance', category: 'Insurance', amount: 28_500_00, frequency: 'yearly', day: 22, startMonth: 1 },
    { book: 'personal', name: 'Car loan EMI', vendor: 'HDFC Bank', kind: 'loan', category: 'Loan EMI', amount: 18_400_00, frequency: 'monthly', day: 7, autopay: true },
  ];
  const bills: Bill[] = billPlan.map((b) => {
    const billId = id();
    let due = `${months[b.startMonth ?? 0]}-${String(b.day).padStart(2, '0')}`;
    let amount = b.amount;
    while (due <= end) {
      const isLast = advance(due, b.frequency) > end;
      if (b.unpaidLast && isLast) break;
      const jitter = b.variable ? 1 + (r() - 0.5) * 0.12 : 1;
      add({ book: b.book, kind: 'expense', amount: Math.round((amount * jitter) / 100) * 100, category: b.category, note: b.name, date: due, billId, ...(b.taxRate ? { taxRate: b.taxRate } : {}) });
      if (b.growth) amount = Math.round(amount * (1 + b.growth));
      due = advance(due, b.frequency);
    }
    return {
      id: billId,
      book: b.book,
      name: b.name,
      vendor: b.vendor,
      kind: b.kind,
      amount: Math.round(amount / 100) * 100,
      variable: !!b.variable,
      frequency: b.frequency,
      nextDue: due,
      category: b.category,
      taxRate: b.taxRate,
      autopay: !!b.autopay,
      active: true,
      notes: '',
      createdAt: now,
    };
  });

  const ago = (days: number) => now - days * 86_400_000;
  const secret = (s: Partial<Secret> & Pick<Secret, 'title' | 'username' | 'password' | 'url' | 'book'>, changedDaysAgo: number): Secret => ({
    id: id(),
    notes: '',
    tags: [],
    favorite: false,
    history: [],
    createdAt: ago(changedDaysAgo + 30),
    updatedAt: ago(changedDaysAgo),
    passwordChangedAt: ago(changedDaysAgo),
    ...s,
  });
  v.secrets = [
    secret({ book: 'company', title: 'AWS root', username: 'founder@lumen.studio', password: 'q7#Vt9!mZr2@Lp4xWc8$', url: 'https://console.aws.amazon.com', tags: ['infra'], favorite: true }, 40),
    secret({ book: 'company', title: 'GitHub', username: 'lumen-studio', password: 'G3h!pX9v#Qm2Tz7w', url: 'https://github.com', tags: ['dev'], favorite: true }, 90),
    secret({ book: 'company', title: 'Google Workspace admin', username: 'admin@lumen.studio', password: 'Lumen@2024', url: 'https://admin.google.com', tags: ['admin'] }, 420),
    secret({ book: 'company', title: 'GST portal', username: 'LUMEN29AB', password: 'Lumen@2024', url: 'https://www.gst.gov.in', tags: ['tax'] }, 400),
    secret({ book: 'company', title: 'HDFC Current Account', username: 'lumen_ops', password: 'Rk8$wN2!pZ6@hQ4m', url: 'https://netbanking.hdfcbank.com', tags: ['bank'], favorite: true }, 120),
    secret({ book: 'company', title: 'Figma', username: 'design@lumen.studio', password: 'figma123', url: 'https://figma.com', tags: ['design'] }, 200),
    secret({ book: 'company', title: 'Office Wi-Fi', username: 'LumenStudio-5G', password: 'sunshine', url: '', notes: 'Router admin is on the sticker.', tags: ['office'] }, 600),
    secret({ book: 'company', title: 'Staging dashboard', username: 'admin', password: 'Xb7!tM3#qL9wZ2$e', url: 'http://staging.lumen.local', tags: ['dev'] }, 30),
    secret({ book: 'personal', title: 'Gmail', username: 'aarav@gmail.com', password: 'mT4!vB8#zQ2pW7$k', url: 'https://mail.google.com', favorite: true }, 75),
    secret({ book: 'personal', title: 'ICICI Savings', username: 'aarav.k', password: 'Pq9@xL3!mR7#tV5w', url: 'https://www.icicibank.com' }, 160),
    secret({ book: 'personal', title: 'Netflix', username: 'aarav@gmail.com', password: 'aarav1995', url: 'https://netflix.com', tags: ['streaming'] }, 700),
    secret({ book: 'personal', title: 'Zerodha', username: 'AK1234', password: 'Zr5#qW8!nT2@vX6m', url: 'https://kite.zerodha.com', tags: ['investing'] }, 50),
  ];

  v.settings.company = {
    ...v.settings.company,
    legalName: 'Lumen Studio Private Limited',
    address: '4th Floor, Krishe Sapphire, Madhapur\nHyderabad, Telangana 500081',
    state: 'Telangana',
    taxId: '36AAKCL4821M1Z9',
    email: 'billing@lumen.studio',
    phone: '+91 40 4012 7788',
    bankName: 'HDFC Bank, Madhapur',
    accountName: 'Lumen Studio Private Limited',
    accountNumber: '50200071234567',
    ifsc: 'HDFC0001234',
    upi: 'lumenstudio@hdfcbank',
    invoicePrefix: 'LS/26-27/',
    nextInvoiceNumber: 15,
  };

  const item = (description: string, code: string, qty: number, rate: number, taxRate = 18): InvoiceItem => ({ id: id(), description, code, qty, rate, taxRate });
  const inv = (number: number, p: Partial<Invoice> & Pick<Invoice, 'clientName' | 'placeOfSupply' | 'items' | 'issueDate' | 'status'>): Invoice => ({
    id: id(),
    number: `LS/26-27/${String(number).padStart(4, '0')}`,
    clientAddress: '',
    clientTaxId: '',
    clientEmail: '',
    dueDate: addDays(p.issueDate, 15),
    notes: 'Thank you for your business. Please quote the invoice number with your payment.',
    createdAt: now,
    updatedAt: now,
    ...p,
  });
  v.invoices = [
    inv(14, { clientName: 'Pebble Technologies', clientAddress: 'HSR Layout, Bengaluru 560102', clientTaxId: '29AAGCP7712K1ZQ', placeOfSupply: 'Karnataka', issueDate: end, status: 'draft', items: [item('Design retainer — next month', '998391', 1, 2_11_864_00)] }),
    inv(13, { clientName: 'Atlas Bank Ltd', clientAddress: 'Bandra Kurla Complex, Mumbai 400051', clientTaxId: '27AABCA1234F1Z5', clientEmail: 'ap@atlasbank.in', placeOfSupply: 'Maharashtra', issueDate: addDays(end, -6), status: 'sent', projectId: projects[0].id, items: [item('Mobile banking app — Milestone 5: payments module', '998314', 1, 3_40_000_00), item('Accessibility audit and fixes', '998314', 24, 3_500_00)] }),
    inv(12, { clientName: 'Kite Logistics Pvt Ltd', clientAddress: 'HITEC City, Hyderabad 500081', clientTaxId: '36AAFCK9981B1ZT', clientEmail: 'finance@kitelogistics.in', placeOfSupply: 'Telangana', issueDate: addDays(end, -24), status: 'sent', projectId: projects[2].id, items: [item('Fleet portal — Sprint 7 and 8', '998314', 2, 1_10_000_00), item('Cloud hosting pass-through (Sept)', '998315', 1, 18_400_00)] }),
    inv(11, { clientName: 'Saffron Health', clientAddress: 'Anna Salai, Chennai 600002', clientTaxId: '33AAJCS5521L1Z2', placeOfSupply: 'Tamil Nadu', issueDate: addDays(end, -40), status: 'paid', paidDate: addDays(end, -28), projectId: projects[3].id, items: [item('Patient app pilot — discovery and prototype', '998314', 1, 1_69_492_00)] }),
  ];

  v.budgets = (
    [
      ['personal', 'Dining', 12_000_00],
      ['personal', 'Groceries', 16_000_00],
      ['personal', 'Shopping', 15_000_00],
      ['personal', 'Travel', 20_000_00],
      ['personal', 'Subscriptions', 1_000_00],
      ['company', 'Cloud', 40_000_00],
      ['company', 'APIs', 22_000_00],
      ['company', 'Software', 20_000_00],
      ['company', 'Marketing', 50_000_00],
      ['company', 'Travel', 25_000_00],
    ] as [Book, string, number][]
  ).map(([book, category, amount]) => ({ id: id(), book, category, amount, createdAt: now }));

  v.rules = [
    { id: id(), book: 'company', match: 'pebble', category: 'Retainer', createdAt: now },
    { id: id(), book: 'personal', match: 'cult', category: 'Health', createdAt: now },
  ];

  const doc = (name: string, folder: DocFolder, book: Book, extra: Partial<Doc> = {}): Doc => ({
    id: id(),
    book,
    name,
    mime: 'application/pdf',
    size: 0,
    folder,
    tags: [],
    notes: '',
    createdAt: now - Math.floor(r() * 200) * 86_400_000,
    ...extra,
  });
  v.docs = [
    doc('Certificate of Incorporation.pdf', 'legal', 'company', { tags: ['MCA'] }),
    doc('GST Registration Certificate.pdf', 'tax', 'company', { tags: ['GST'] }),
    doc('Company PAN.pdf', 'tax', 'company'),
    doc('GSTR-3B September.pdf', 'tax', 'company', { tags: ['GST', 'filed'] }),
    doc('Office lease — WeWork Krishe.pdf', 'contracts', 'company', { expiresOn: addDays(end, 150) }),
    doc('Atlas Bank — Master Services Agreement.pdf', 'contracts', 'company', { tags: ['client'] }),
    doc('Business insurance policy.pdf', 'insurance', 'company', { expiresOn: addDays(end, 210) }),
    doc('HDFC current account — September.pdf', 'bank', 'company'),
    doc('MacBook Pro invoice.pdf', 'receipts', 'company', { tags: ['equipment'] }),
    doc('Passport.pdf', 'identity', 'personal', { expiresOn: addDays(end, 38), notes: 'Renew at least 6 months before travel.' }),
    doc('PAN card.pdf', 'identity', 'personal'),
    doc('Aadhaar.pdf', 'identity', 'personal'),
    doc('Health insurance — Star Health.pdf', 'insurance', 'personal', { expiresOn: addDays(end, 19) }),
    doc('Car RC and insurance.pdf', 'property', 'personal', { expiresOn: addDays(end, 95) }),
    doc('ITR-V FY 2025-26.pdf', 'tax', 'personal', { tags: ['ITR'] }),
  ].map((d) => ({ ...d, size: 40_000 + Math.floor(r() * 900_000) }));

  v.projects = projects;
  v.bills = bills;
  v.transactions = tx;
  v.transfers = tr;
  // Keep a couple of entries dated today so the dashboard feels alive.
  add({ book: 'personal', kind: 'expense', amount: 640_00, category: 'Dining', note: 'Coffee + breakfast', date: end });
  add({ book: 'company', kind: 'expense', amount: 3_499_00, category: 'Software', note: 'Domain renewal', date: addDays(end, -1) });
  return v;
}

/** A small real PDF standing in for a demo document, so preview and download work. */
export function demoDocBlob(doc: Doc): Blob {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '-');
  const lines = [
    ['F1', 22, 72, 760, esc(doc.name.replace(/\.pdf$/i, ''))],
    ['F2', 12, 72, 730, 'Sample document from the Kosh demo.'],
    ['F2', 12, 72, 712, 'Files you add to your own vault are encrypted on your device.'],
    ['F2', 10, 72, 80, 'kosh - github.com/kunalakrishna12/kosh'],
  ] as const;
  const stream = lines.map(([f, size, x, y, text]) => `BT /${f} ${size} Tf ${x} ${y} Td (${text}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}
