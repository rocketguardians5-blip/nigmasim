import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Runtime simulasi NigmaSim.
 *
 * Origin sendiri (port 5180) supaya terpisah dari admin (5173), backend (8000),
 * dan capture worker (8010).
 *
 * CSP:
 * - dev  : butuh 'unsafe-inline' + websocket untuk HMR Vite.
 * - preview/build : CSP ketat. Inilah yang diuji Playwright.
 *
 * `connect-src 'self'` memastikan tidak ada fetch ke API produksi/backend admin.
 */
const STRICT_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-src 'self'",
].join('; ')

const DEV_CSP = STRICT_CSP.replace(
  "script-src 'self'",
  "script-src 'self' 'unsafe-inline'",
).replace(
  "connect-src 'self'",
  "connect-src 'self' ws: http://localhost:5180 http://127.0.0.1:5180",
)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@sim/core': fileURLToPath(new URL('./packages/sim-core/src/index.ts', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5180,
    strictPort: true,
    headers: { 'Content-Security-Policy': DEV_CSP },
  },
  preview: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    headers: { 'Content-Security-Policy': STRICT_CSP },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
})
