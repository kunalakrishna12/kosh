/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// A strict Content-Security-Policy for production builds. Kosh loads no third-party
// scripts; the only outside host it may ever talk to is the opt-in breach check.
// (Not applied in dev, where Vite needs inline scripts for hot reload.)
const csp: Plugin = {
  name: 'kosh-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.pwnedpasswords.com",
      "frame-src blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
    return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
  },
};

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), csp],
  test: {
    environment: 'node',
  },
});
