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
        // Apple-style soft radii — โค้งนุ่มแบบ apple.com
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '22px',
        '3xl': '28px',
      },
      boxShadow: {
        // เงานุ่มมีเลเยอร์ (ambient + key) + ระดับ hover ที่ยกขึ้น
        card: '0 1px 2px rgba(17,17,26,0.04), 0 4px 16px rgba(17,17,26,0.05)',
        cardHover: '0 4px 12px rgba(17,17,26,0.06), 0 12px 32px rgba(17,17,26,0.10)',
        pop: '0 12px 40px rgba(0,0,0,0.14)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
