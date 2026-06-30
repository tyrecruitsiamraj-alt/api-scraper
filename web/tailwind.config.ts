import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-kanit)', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Aligned with the SIAMRAJATHANEE CEO Dashboard design system.
        ink: '#1d1d1f',
        muted: '#6e6e73',
        subtle: '#6e6e73', // alias of muted (kept for existing components)
        line: '#e6e6eb',
        hairline: '#e6e6eb', // alias of line
        canvas: '#f5f5f7',
        // SIAMRAJ brand red (siamrajathanee.com)
        accent: { DEFAULT: '#e41c24', hover: '#c1161d' },
        accentDark: '#c1161d',
        good: '#34c759',
        bad: '#ff3b30',
      },
      borderRadius: {
        xl: '14px',
        '2xl': '16px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04), 0 8px 28px rgba(0,0,0,0.06)',
        pop: '0 12px 40px rgba(0,0,0,0.12)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
