# Security

Kosh holds people's finances and passwords, so we take security reports seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private
[security advisory form](https://github.com/kunalakrishna12/kosh/security/advisories/new) instead.
We aim to reply within 72 hours.

## How Kosh protects your data

| | |
|---|---|
| **Encryption** | The whole vault is one AES-256-GCM ciphertext, with a fresh 96-bit IV on every save and an authenticated header. |
| **Key derivation** | PBKDF2-HMAC-SHA256, 600,000 iterations (the [OWASP 2023](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) recommendation), 128-bit random salt. |
| **Key handling** | The derived key is a non-extractable WebCrypto key held only in memory. It is discarded on lock or auto-lock. The master password is never stored. |
| **Storage** | IndexedDB in your browser holds only the sealed blob. Nothing readable is written to disk. |
| **Network** | None. The production build ships a Content-Security-Policy that blocks every outside host except the opt-in breach check. |
| **Breach check** | Optional and user-triggered. Uses Have I Been Pwned's k-anonymity range API: only the first 5 hex characters of a SHA-1 hash are sent, with response padding. |
| **Clipboard** | Copied passwords are cleared after 20 seconds if the clipboard still holds them. |

## Known limits

- Anyone with your unlocked browser session can see your data. Use auto-lock.
- Browser extensions with access to every page can read what the page shows. Use a browser profile without untrusted extensions.
- PBKDF2 is not memory-hard. Argon2id is on the roadmap. Until then, a long master password is your best defence.
- There is no password recovery. Keep an encrypted backup (Settings → Encrypted backup).
