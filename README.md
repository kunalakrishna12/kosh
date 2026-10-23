<div align="center">

<img src="public/favicon.svg" width="72" alt="Kosh logo" />

# Kosh

**Your money, your company's money, and every password, in one encrypted vault that never leaves your device.**

The open-source finance and security workspace for founders, freelancers and small teams.

[**Try the live demo →**](https://kunalakrishna12.github.io/kosh/?demo) &nbsp;·&nbsp; [Use it for real](https://kunalakrishna12.github.io/kosh/) &nbsp;·&nbsp; [Security model](SECURITY.md) &nbsp;·&nbsp; [Contribute](CONTRIBUTING.md)

[![CI](https://github.com/kunalakrishna12/kosh/actions/workflows/ci.yml/badge.svg)](https://github.com/kunalakrishna12/kosh/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/license-MIT-f0c36a)
![No servers](https://img.shields.io/badge/servers-none-3fd9c1)
![Encryption](https://img.shields.io/badge/AES--256--GCM-encrypted-9b8cff)

</div>

---

## Why Kosh?

If you run a company, your money lives in two places: your pocket and the business. Most apps only see one. So you end up with a personal budgeting app, an accounting tool for the company, a spreadsheet for "money I put in", a reminder app for bills, and a password manager on the side.

**Kosh puts it all in one place and understands how the pieces connect:**

- Pay a company bill with your personal card, and Kosh knows the company now owes you.
- Draw a salary, and it counts as your income *and* a company cost. Across both books it cancels out, because it's your own money moving.
- Tag spending to a client project, and you see the real margin, budget burn and what's left to collect.
- Record cloud and API bills once. Kosh reminds you when they're due, flags price jumps, and plans them into a cash forecast.

All of it is encrypted on your device. **No account, no server, no tracking.**

## Features

### 💸 Money: personal and company, side by side
- **Two books in one place.** Personal and company income and expenses, with smart categories.
- **You ↔ Company ledger.** Capital, loans, salary, dividends, repayments and reimbursements, plus a live **"company owes you"** balance.
- **Cash in each pocket**, from opening balances plus every entry and transfer.
- **Fast entry.** Press `N` anywhere, or use `⌘K` for everything.

### 🧾 Bills: never miss one, never overpay
- Recurring bills for **cloud, APIs, SaaS, rent, utilities, insurance, EMIs and CA fees**: weekly, monthly, quarterly or yearly.
- **Usage-based bills** (AWS, OpenAI, Twilio…) take the real amount when paid, and Kosh warns when one jumps.
- **Overdue and due-this-week** alerts, plus your monthly and yearly committed spend by type.
- **One-click "Pay"** records the payment and rolls the bill to its next due date.

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

### 🔐 Password vault
- Personal and company logins kept apart, with a **generator**, **strength meter**, **reuse detection** and age tracking.
- **Vault health score** with one-click fixes.
- **Breach check** against Have I Been Pwned using k-anonymity. Your passwords never leave the device.
- Clipboard auto-clears after 20 seconds.

### ✨ Built with care
- Dark and light themes, keyboard-first, responsive down to phones.
- Hand-written SVG charts and a single CSS file: no UI kit, no chart library, about 95 KB gzipped.
- Works offline once loaded.

## Privacy and security

| | |
|---|---|
| Where is my data? | In your browser's IndexedDB, as **one AES-256-GCM encrypted blob**. |
| How is it encrypted? | Your master password goes through **PBKDF2-SHA256 (600,000 rounds)** to make a non-extractable key, held only in memory. |
| Does anything go to a server? | **No.** A strict Content-Security-Policy blocks all outside hosts. The one exception is the breach check, and only when you click it. |
| Can you reset my password? | No one can. Download an **encrypted backup** (Settings) and keep it somewhere safe. |

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

React 18 · TypeScript · Vite · WebCrypto · IndexedDB · Vitest. Three runtime dependencies: React, lucide-react icons, and the Inter font.

```bash
npm test          # crypto, money model, bills, tax, reports, passwords + a full UI smoke test
npm run typecheck
npm run build
```

## Roadmap

- [ ] Import bank and card statements (CSV / OFX), with auto-categorise rules
- [ ] Invoices: create, send and track payments, linked to projects and GST
- [ ] Budgets per category with alerts
- [ ] Multi-currency entries with FX rates
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
