import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Server dev bisa diakses dari perangkat lain di WiFi yang sama
 * (mis. HP untuk melihat tampilan mobile).
 *
 * `host: true`  -> dengarkan di semua interface, bukan hanya 127.0.0.1
 * `proxy /api`  -> request ke /api/v1 diteruskan ke backend lokal.
 *                  Ini penting: dari HP, "localhost" berarti HP itu sendiri.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
  },
})
