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
        // Ferrari: sharp 0px is the dominant radius. Flatten common inline
        // roundings (lg/xl/2xl/3xl) app-wide; keep `full` for pills/badges only.
        md: '0px',
        lg: '0px',
        xl: '0px',
        '2xl': '0px',
        '3xl': '0px',
      },
      boxShadow: {
        // Ferrari uses hairlines + photographic depth — no soft shadow tiers.
        card: 'none',
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
