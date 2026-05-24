/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#fff3ed',
          100: '#ffe0d2',
          400: '#ff8a5e',
          500: '#FF6B35',
          600: '#ea5a28',
          700: '#c2410c',
        },
        // ページ背景
        app: {
          DEFAULT: '#F5F5F5',
          dark: '#0F0F0F',
        },
        // カード・ヘッダー背景
        card: {
          DEFAULT: '#FFFFFF',
          dark: '#1A1A1A',
        },
        // ボーダー
        edge: {
          DEFAULT: '#E5E5E5',
          dark: '#2A2A2A',
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
    },
  },
  plugins: [
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@tailwindcss/forms'),
  ],
}
