<div align="center">

<img src="public/favicon.svg" width="72" alt="Kosh logo" />

# Kosh

**Your money, your company's money, your documents and every password, in one encrypted vault that never leaves your device.**

The open-source finance and security workspace for founders, freelancers and small teams.

[**Try the live demo →**](https://kunalakrishna12.github.io/kosh/?demo) &nbsp;·&nbsp; [Use it for real](https://kunalakrishna12.github.io/kosh/) &nbsp;·&nbsp; [Security model](SECURITY.md) &nbsp;·&nbsp; [Contribute](CONTRIBUTING.md)

[![CI](https://github.com/kunalakrishna12/kosh/actions/workflows/ci.yml/badge.svg)](https://github.com/kunalakrishna12/kosh/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/license-MIT-f0c36a)
![No servers](https://img.shields.io/badge/servers-none-3fd9c1)
![Encryption](https://img.shields.io/badge/AES--256--GCM-encrypted-9b8cff)

</div>

---

## Why Kosh?

If you run a company, your money lives in two places: your pocket and the business. Most apps only see one. So you end up with a personal budgeting app, an accounting tool for the company, an invoicing tool, a spreadsheet for "money I put in", a reminder app for bills, a folder of PDFs, and a password manager on the side.

**Kosh puts it all in one place and understands how the pieces connect:**

- Pay for something in cash, and your cash in hand goes down. Kosh warns you before it would go below zero.
- Pay a company bill with your personal card, and Kosh knows the company now owes you.
- Draw a salary, and it counts as your income *and* a company cost. Across both books it cancels out, because it's your own money moving.
- Tag spending to a client project, and you see the real margin, budget burn and what's left to collect.
- Record cloud and API bills once. Kosh reminds you when they're due, flags price jumps, and plans them into a cash forecast.
- Import your bank statement, and Kosh categorises every line, skips what you already have, ticks off bills it recognises, and marks invoices paid when the client's payment shows up.

All of it is encrypted on your device. **No account, no server, no tracking.**

## Features

### 💸 Money: personal and company, side by side
- **Two books in one place.** Personal and company income and expenses, with smart categories.
- **Accounts and cash.** Every bank account, cash in hand, credit card and wallet, for you and the company, each with its details (account number, IFSC, UPI) and a live balance. Each one is drawn as a card in its own colour, with a chip, the last four digits, the holder and the bank. Record ATM withdrawals, cash deposits and card bill payments as moves between your own accounts, and **update a balance** after counting your cash without disturbing profit and loss.
- **Cash is a first-class choice.** Every expense and income asks *Paid with* or *Received into*, with Cash first, then your banks, cards and wallets with their balances. It shows what's left after the entry, e.g. "Cash after this: ₹33,750", and warns when an expense would take cash or a bank below zero. If you have no cash account yet, Kosh creates one the first time you pick Cash.
- **Foreign-currency entries.** Record a $20 or €9.99 charge with its rate and your card's forex fee, and the rupee amount follows.
- **SIPs and investments.** Add a SIP once (amount, date, the bank account it's debited from). Kosh reminds you, records each instalment on “Done” as savings, not spending, and shows invested vs current value and your return for every fund.
- **You ↔ Company ledger.** Capital, loans, salary, dividends, repayments and reimbursements, plus a live **"company owes you"** balance.
- **Cash in each pocket**, from opening balances plus every entry and transfer.
- **Bank statement import.** Drop in a CSV from HDFC, ICICI, SBI, Axis, Kotak or almost any bank or card. Kosh finds the header, works out the date format and columns, auto-categorises each line (your rules, then your history, then a built-in merchant list), flags duplicates, matches bill payments and invoice receipts, and learns from your corrections.
- **Fast entry.** Press `N` anywhere, or use `⌘K` for everything. Attach a receipt to any entry.

### 🧾 Bills: never miss one, never overpay
- Recurring bills for **cloud, APIs, SaaS, rent, utilities, insurance, EMIs and CA fees**: weekly, monthly, quarterly or yearly.
- **Usage-based bills** (AWS, OpenAI, Twilio…) take the real amount when paid, and Kosh warns when one jumps.
- **Bills in dollars, euros and more.** Enter $20, the rate and your card's forex fee (3.5% + GST by default). Kosh estimates the rupee cost, learns the real rate from each statement charge, and only flags a price rise when the dollar price changes.
- **Overdue and due-this-week** alerts, plus your monthly and yearly committed spend by type.
- **Paid from:** choose the card or account a bill is charged to, and paying it takes the money from there.
- **One-click "Pay"** records the payment and rolls the bill to its next due date. One-time bills close once paid.

### 🧾 Invoices with GST
- Professional **tax invoices** with HSN/SAC codes, quantities and per-line GST rates.
- **CGST + SGST or IGST worked out automatically** from your state and the client's place of supply.
- **Amount in words** (lakh and crore for rupees), your GSTIN, bank account and UPI on every invoice.
- Sequential numbering such as `LS/26-27/0001`, payment terms, client details remembered.
- **Print or save as PDF**, copy a payment reminder, and **mark paid** to post the income to your books split by GST rate.
- See what's waiting to be paid, what's overdue, and your average days to get paid.

### 👥 Staff & payroll
- Employees, interns and contractors with designation, ID, PAN, UAN, bank details and a monthly salary structure (Basic, HRA, allowances), with a one-click split from gross.
- **Indian payroll built in:** PF (12% of Basic up to the ₹15,000 ceiling, employer match), ESI (0.75% + 3.25% up to ₹21,000), professional tax, TDS on salary, and TDS % for contractors.
- **Monthly payroll run** with loss-of-pay days, bonus, reimbursements and advance recovery, prorated for joiners and leavers.
- **Printable payslips** (save as PDF), net pay in words, employer contributions shown.
- Paying records each salary as a company expense and adds the **TDS, PF/ESI and PT deposits to Bills** with their due dates.
- Headcount, monthly payroll cost, payroll by month, year-to-date pay, TDS and PF per person, and a reminder when this month's payroll is due.

### 🎯 Budgets
- **One monthly budget** for you and one for the company, covering every expense, bills included.
- **Safe to spend**: what's left after spending so far *and* bills still due this month, with a daily allowance.
- **A warning before you go over**: the entry form shows what an expense does to its category and monthly budget as you type.
- **Realistic month-end projection** from how you usually spend the rest of the month (rent and payroll land on fixed days), plus a day-by-day chart against an even pace.
- Optional limits per category, a list of spending with no category budget, and 6 months of history showing how often you stayed within budget.
- **Suggested budgets** from your last three months of spending.
- Early warnings in Insights before you go over.

### 📊 Accounting: what your CA asks for
- **Profit & loss statement** for the company or yourself, compared with the previous period.
- **GST / VAT summary**: output tax, input credit, net payable, broken down by rate.
- **Financial-year periods** (April–March in India, or any start month), plus months and quarters.
- **"Ready for your accountant?" checklist** for uncategorised entries, missing GST, overdue bills and unreimbursed spends.
- **Export** P&L and GST registers to CSV, or print to PDF.

### 📈 Planning and insights
- **Cash forecast**: 6 months ahead from your scheduled bills and average income and spending, with the lowest point flagged.
- **Runway**, company margin and personal savings rate.
- **Project profitability**: contract vs budget, budget burn, collection, margin.
- Plain-language **insights**: spending spikes, projects over budget, bills that jumped, money you're owed.

### 🗂 Document vault
- Store incorporation papers, GST certificates, contracts, bank statements, receipts, IDs and insurance policies.
- **Every file is encrypted separately** with AES-256-GCM before it's saved, and included in your encrypted backup.
- Folders, tags, search, in-app preview for PDFs and images, and **expiry reminders** for passports, policies and leases.
- **Save a file's own password** (protected bank statements, e-Aadhaar, ITR-V, Form 16) with it, shown above the preview with one-click copy.
- Link files to transactions, bills and invoices.

### 🔐 Password vault
- Personal and company logins kept apart, with a **generator**, **strength meter**, **reuse detection** and age tracking.
- **Vault health score** with one-click fixes.
- **Breach check** against Have I Been Pwned using k-anonymity. Your passwords never leave the device.
- Clipboard auto-clears after 20 seconds.

### ✨ Design and feel
- **Dark and light themes** on a soft ambient background, with slightly see-through cards. Switching theme spreads the new colours in a circle from the button.
- **Tinted summary tiles** whose colour always means the same thing: violet personal, teal company, green money in, rose owed or overdue, gold attention. The Overview tiles show a six-month sparkline and the change on the last 30 days.
- **Kosh's own calendar** for every date: the same in every browser, themed, with Today and Clear, and full keyboard control.
- **Motion that explains, not decorates.**
  - Page titles rise letter by letter, cards arrive in a wave and the big numbers count up.
  - The highlight glides to whatever you select.
  - Dialogs drop in and fade out.
  - It all turns off with your system's *Reduce motion* setting.
- **Made for phones too.**
  - A floating tab bar with the add button in the middle.
  - Dialogs that rise as bottom sheets with the buttons in reach.
  - Fields that don't make iOS zoom.
- **Keyboard-first:** `N` for a new entry, `⌘K` for everything, `⌘⇧L` to lock.
- Hand-written SVG charts and animations on the browser's own Web Animations API. No UI kit, chart library or animation library: about 165 KB gzipped in total. Works offline once loaded.

## Privacy and security

| | |
|---|---|
| Where is my data? | In your browser's IndexedDB: **one AES-256-GCM encrypted vault**, plus each document encrypted separately with the same key. |
| How is it encrypted? | Your master password goes through **PBKDF2-SHA256 (600,000 rounds)** to make a non-extractable key, held only in memory. |
| Does anything go to a server? | **No.** A strict Content-Security-Policy blocks all outside hosts except two lookups that run only when you click them: the password breach check, and "Today's rate" for a currency pair (frankfurter.app). |
| What about my bank statements? | They're read on your device. Nothing is uploaded. |
| Can you reset my password? | No one can. Download an **encrypted backup** (Settings), which includes your documents, and keep it somewhere safe. |

Full details in [SECURITY.md](SECURITY.md).

## Quick start

Use the hosted version at **[kunalakrishna12.github.io/kosh](https://kunalakrishna12.github.io/kosh/)**. It's a static page: your data stays in your browser.

Or run it yourself:

```bash
git clone https://github.com/kunalakrishna12/kosh.git
cd kosh
npm install
npm run dev           # open http://localhost:5173  (or /?demo for sample data)
```

To self-host, build with `npm run build` and serve the `dist/` folder from any static host (Nginx, Netlify, Cloudflare Pages, S3…).

## How the money model works

```
P&L (earned vs spent)
  personal income  = personal income + salary and dividends drawn from the company
  company expense  = company expenses + salary paid to you
  (capital, loans, repayments and reimbursements move cash but are not income or expense)

Cash (what's in each pocket)
  personal = opening + income − expenses − company bills you paid − money you put in + money it paid you
  company  = opening + income − expenses it paid + money you put in − money it paid you

Company owes you = loans + company bills you paid personally − repayments − reimbursements
```

GST/VAT amounts are treated as *included* in each entry. 1,180 at 18% means 1,000 taxable value plus 180 tax.

All maths uses integer minor units (paise/cents), so totals never drift. See [`src/lib/analytics.ts`](src/lib/analytics.ts) and [`src/lib/reports.ts`](src/lib/reports.ts).

## Tech

React 18 · TypeScript · Vite · WebCrypto · IndexedDB · Web Animations API · Vitest. Three runtime dependencies: React, lucide-react icons, and the Inter font.

```bash
npm test          # 130+ tests: crypto, money model, bills, tax, invoices, budgets, payroll, accounts, FX, import, passwords, motion + a full UI smoke test
npm run typecheck
npm run build
```

## Roadmap

- [x] Import bank and card statements (CSV), with auto-categorise rules
- [x] Invoices with GST, linked to projects and payments
- [x] Budgets per category with alerts
- [x] Encrypted document vault with expiry reminders
- [x] Staff, payroll and payslips with PF, ESI, PT and TDS
- [x] Accounts, cash and cards, with cash as a payment choice on every entry
- [x] SIPs and investments with returns
- [x] Bills and entries in foreign currency, with forex fees
- [x] Phone layout and motion
- [ ] Excel (.xlsx), OFX and PDF statement import
- [ ] Email invoices, and e-invoicing (IRN / QR) for GST
- [ ] Credit limits on cards, with a spend bar
- [ ] Optional end-to-end-encrypted sync between devices
- [ ] Argon2id key derivation
- [ ] Installable PWA and desktop app
- [ ] Shared company vault for teams

Have an idea? [Open an issue](https://github.com/kunalakrishna12/kosh/issues/new/choose). Want to build one? See [CONTRIBUTING.md](CONTRIBUTING.md).

## Disclaimer

Kosh helps you organise and understand your numbers. It is not tax or legal advice, and it doesn't file returns. Have a qualified accountant review anything you submit.

## License

[MIT](LICENSE) © Satya Venkata Sri Krishna Kunala

<div align="center"><sub>If Kosh is useful to you, a ⭐ helps other founders find it.</sub></div>
