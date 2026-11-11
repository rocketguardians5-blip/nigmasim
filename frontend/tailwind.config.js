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
        // Aksen tunggal
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
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
