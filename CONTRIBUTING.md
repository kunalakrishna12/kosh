# Contributing to Kosh

Thanks for helping. Kosh is small on purpose: React, TypeScript, Vite, and almost no dependencies. Charts are hand-written SVG and styles are plain CSS with design tokens.

## Getting started

```bash
git clone https://github.com/kunalakrishna12/kosh.git
cd kosh
npm install
npm run dev        # http://localhost:5173  (add ?demo to load sample data)
npm test           # unit tests + a UI smoke test
npm run typecheck
```

## Where things live

| Path | What it does |
|---|---|
| `src/lib/crypto.ts` | Vault encryption (PBKDF2 → AES-256-GCM) |
| `src/lib/analytics.ts` | The money model: balances, cash flow, runway, insights |
| `src/lib/bills.ts` | Recurring bills: due dates, monthly cost, price changes |
| `src/lib/reports.ts` | P&L statements, GST/VAT summary, financial-year periods, cash forecast |
| `src/lib/invoices.ts` | Invoice totals, CGST/SGST/IGST split, amount in words, payment entries |
| `src/lib/budgets.ts` | Budget progress, month-end pace, suggestions |
| `src/lib/importer.ts` | CSV parsing, column/date detection, auto-categorising, bill and invoice matching |
| `src/lib/passwords.ts` | Generator, strength estimate, vault health, breach check |
| `src/lib/demo.ts` | The sample data behind `?demo` |
| `src/store.tsx` | Unlock / lock / auto-save |
| `src/views/*` | One file per screen |
| `src/styles.css` | Design tokens and every style |

## Ground rules

1. **Nothing leaves the device.** No analytics, no remote fonts, no CDNs. Any new network call must be opt-in and explained in the UI.
2. **Money is integers.** Amounts are stored in minor units (paise/cents). Never do maths on floats.
3. **Pure logic goes in `src/lib` with tests.** Views should stay thin.
4. **Keep the vault format backward compatible.** Add optional fields, and extend `migrate()` in `store.tsx` for defaults.
5. **Dark and light both.** Use the CSS tokens; don't hard-code colours.

## Good first issues

- More currencies and locales
- Add your bank's statement format to the importer tests
- Excel (.xlsx) and OFX statement import
- More merchants in the built-in categoriser (`src/lib/importer.ts`)
- Argon2id key derivation (WASM)
- Translations

Open an issue before large changes so we can agree on the approach.
