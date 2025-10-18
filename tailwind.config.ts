import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx,html}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        primary: '#1f6feb',
        accent: '#f97316'
      }
    }
  },
  plugins: []
} satisfies Config;
