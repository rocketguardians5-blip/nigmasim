/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0b1220',
          900: '#111a2e',
          800: '#1b2640',
          700: '#2a3854',
        },
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          400: '#4b9bff',
          500: '#2f86f6',
          600: '#1c6fdd',
          700: '#175bb4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.1)',
      },
    },
  },
  plugins: [],
}
