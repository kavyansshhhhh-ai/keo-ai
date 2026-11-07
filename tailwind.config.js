/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
        success: { 300: '#6ee7b7', 400: '#34d399', 500: '#10b981' },
        warning: { 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b' },
        'error-300': '#fda4af',
        'error-400': '#fb7185',
        'error-500': '#f43f5e',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'sheet-up': {
          from: { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          to: { opacity: '1', transform: 'none' },
        },
        'ring-pulse': {
          '0%': { transform: 'scale(1)', opacity: '0.55' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        'dot-bounce': {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.35' },
          '40%': { transform: 'translateY(-4px)', opacity: '1' },
        },
        caret: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'sheet-up': 'sheet-up 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
        'ring-pulse': 'ring-pulse 1.6s ease-out infinite',
        'dot-bounce': 'dot-bounce 1.2s ease-in-out infinite',
        caret: 'caret 1s steps(1) infinite',
      },
    },
  },
  plugins: [],
};
