/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'pulse-icon': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%':       { transform: 'scale(1.08)' },
        },
      },
      animation: {
        'pulse-icon': 'pulse-icon 0.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}