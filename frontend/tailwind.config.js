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
        'amd-red': '#E8000D',
        'amd-charcoal': '#1A1A1A',
        'amd-white': '#F5F5F0',
        'amd-orange': '#FF6B00',
        'amd-gray': '#2C2C2C',
        'amd-green': '#00C853',
        'amd-purple': '#9B59B6',
      },
      fontFamily: {
        'heading': ['Syne', 'sans-serif'],
        'body': ['Inter', 'sans-serif'],
      },
      backdropBlur: {
        'glass': '16px',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(232, 0, 13, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(232, 0, 13, 0.6)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
