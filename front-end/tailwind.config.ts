import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class', // Penting untuk fitur toggle switch manual
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './Admin/**/*.{js,ts,jsx,tsx}',
    './chatbot/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 1. Semantic Colors (Menggunakan variabel CSS dari globals.css)
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        border: 'var(--border)',

        primary: {
          DEFAULT: 'var(--primary)', 
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)', 
          foreground: 'var(--secondary-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)', 
          foreground: 'var(--accent-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)', 
          foreground: 'var(--muted-foreground)',
        },

        // 2. Official Unpad Palette (Hardcoded Hex)
        // Gunakan ini jika ingin warna spesifik tanpa terpengaruh dark mode otomatis
        unpad: {
          lightGray: '#E6E6E6',
          aqua: '#389EA9',
          gold: '#F4B106',
          teal: '#42929D',      // Primary Brand Color
          darkTeal: '#2B7F8A',
          orange: '#ED910C',
        },
      },
    },
  },
  plugins: [],
};

export default config;