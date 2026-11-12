/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Netral — satu-satunya warna mendasar di UI
        ink: {
          950: '#0A0F1A',
          900: '#111827',
          800: '#1F2937',
          700: '#374151',
        },
        // Aksen tunggal - diturunkan dari warna logo PT Nigmagrid (#0085CC)
        // digelapkan agar kontras teks putih >= 4.5:1 (WCAG AA).
        brand: {
          50: '#EAF4FB',
          100: '#D2E9F6',
          200: '#A5D3ED',
          300: '#6FB8E1',
          400: '#2F9AD0',
          500: '#0085CC',
          600: '#0077BA',
          700: '#006BA8',
        },
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '5px',
        md: '6px',
        lg: '8px',
        xl: '10px',
      },
      boxShadow: {
        // Kartu TIDAK memakai shadow. Hanya overlay.
        card: 'none',
        overlay: '0 12px 32px -12px rgba(15, 23, 42, 0.22)',
        pop: '0 4px 12px -4px rgba(15, 23, 42, 0.14)',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
