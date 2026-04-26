/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy:    { DEFAULT: '#0d1b2a', 800: '#1a2f45', 700: '#1e3a54' },
        gold:    { DEFAULT: '#d4a843', light: '#e8c56a', dark: '#b88a2e' },
        crimson: { DEFAULT: '#6b1a1a', 800: '#8b2020' },
        silver:  { DEFAULT: '#b0b8c1', light: '#d0d8e1' },
        pitch:   { DEFAULT: '#050810', 800: '#0d1525', 900: '#080d18' },
        star:    { DEFAULT: '#f5c842' },
        ink: {
          DEFAULT: '#0a0c12', 900: '#0f1218', 800: '#161b26',
          700: '#1e2535', 600: '#2a3347', 500: '#3d4f6a', 400: '#5a7090', 300: '#7a96b8',
        },
        chalk: {
          DEFAULT: '#e8edf5', 900: '#f0f4fa', 800: '#d8e0ec', 700: '#c0cce0',
        },
      },
      fontFamily: {
        display: ['Playfair Display', 'serif'],
        body:    ['DM Sans', 'sans-serif'],
        mono:    ['DM Mono', 'monospace'],
      },
      animation: {
        'fade-up': 'fadeUp 0.5s ease-out forwards',
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      backgroundImage: {
        'board-pattern': "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='20' height='20' fill='%23ffffff08'/%3E%3Crect x='20' y='20' width='20' height='20' fill='%23ffffff08'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};