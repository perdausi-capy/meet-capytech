import type { Config } from 'tailwindcss';

const config: Config = {
  // The theme toggle switches a `dark` class on <html>; follow it rather than the OS setting.
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        // Guest-facing design tokens (see globals.css).
        canvas: 'var(--g-bg)',
        card: 'var(--g-card)',
        'card-solid': 'var(--g-card-solid)',
        ink: 'var(--g-ink)',
        'ink-2': 'var(--g-ink-2)',
        muted: 'var(--g-muted)',
        hairline: 'var(--g-line)',
        brand: {
          DEFAULT: 'var(--g-brand)',
          strong: 'var(--g-brand-strong)',
          soft: 'var(--g-brand-soft)',
          ink: 'var(--g-brand-ink)',
        },
        success: 'var(--g-success)',
        danger: 'var(--g-danger)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 12px 40px -12px rgb(15 23 42 / 0.18)',
        lift: '0 8px 24px -8px rgb(37 99 235 / 0.35)',
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
    },
  },
  plugins: [],
};
export default config;
