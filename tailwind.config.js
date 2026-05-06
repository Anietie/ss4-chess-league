/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Primary brand colours
        blue: {
          DEFAULT: '#1a56db',    // Primary blue
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        orange: {
          DEFAULT: '#f97316',    // Primary orange
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
        // Dark theme (replaces ink/navy)
        ink: {
          DEFAULT: '#0a0a0a',    // Near black
          900: '#111111',
          800: '#1a1a1a',
          700: '#222222',
          600: '#2a2a2a',
          500: '#333333',
          400: '#555555',
          300: '#888888',
        },
        // Light text on dark backgrounds
        chalk: {
          DEFAULT: '#f5f5f5',
          900: '#ffffff',
          800: '#f0f0f0',
          700: '#e0e0e0',
        },
        // Accent colours
        gold: {
          DEFAULT: '#f97316',    // Orange as the new "gold" for badges/accents
          light: '#fb923c',
          dark: '#ea580c',
        },
        navy: {
          DEFAULT: '#1a3a5c',    // Deeper blue for cards
          800: '#1e40af',
          700: '#1e3a8a',
        },
        crimson: {
          DEFAULT: '#7f1d1d',
          800: '#991b1b',
        },
        silver: {
          DEFAULT: '#cccccc',
          light: '#e0e0e0',
        },
        pitch: {
          DEFAULT: '#000000',
          800: '#111111',
          900: '#080808',
        },
        star: {
          DEFAULT: '#f97316',    // Orange star for achievements
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
        fadeUp: { 
          from: { opacity: '0', transform: 'translateY(16px)' }, 
          to: { opacity: '1', transform: 'translateY(0)' } 
        },
        shimmer: { 
          '0%': { backgroundPosition: '-200% 0' }, 
          '100%': { backgroundPosition: '200% 0' } 
        },
      },
      backgroundImage: {
        'board-pattern': "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='20' height='20' fill='%23ffffff05'/%3E%3Crect x='20' y='20' width='20' height='20' fill='%23ffffff05'/%3E%3C/svg%3E\")",
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
};