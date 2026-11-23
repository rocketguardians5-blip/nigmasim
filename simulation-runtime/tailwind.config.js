/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './shell/**/*.{ts,tsx}',
    './apps/**/*.{ts,tsx}',
    './packages/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          500: '#4268ff',
          600: '#3257e6',
          700: '#2c4fd1',
        },
        ink: {
          900: '#0f172a',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        overlay: '0 20px 40px -12px rgb(15 23 42 / 0.25)',
      },
    },
  },
  plugins: [],
}
