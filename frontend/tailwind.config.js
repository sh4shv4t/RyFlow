/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: '#1A1A1A',
        elevated: '#222222',
        overlay: '#2A2A2A',
        accent: '#E8000D',
        'accent-muted': 'rgba(232,0,13,0.1)',
        subtle: '#242424',
        'border-d': '#333333',
        'border-s': '#444444',
        't-primary': '#F0F0F0',
        't-secondary': '#999999',
        't-tertiary': '#666666',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
