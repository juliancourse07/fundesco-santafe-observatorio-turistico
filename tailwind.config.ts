import type { Config } from 'tailwindcss';
import { colorHex } from './lib/designTokens';

export default {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        fundesco: {
          forest: colorHex.forest,
          green: colorHex.green,
          lime: colorHex.lime,
          cream: colorHex.cream,
          ink: colorHex.ink,
          slate: colorHex.slate,
          muted: colorHex.muted,
          line: colorHex.line,
          mist: colorHex.mist,
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
