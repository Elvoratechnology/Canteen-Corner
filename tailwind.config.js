/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          teal: '#14b8a6',
          'teal-dark': '#0d9488',
        },
        surface: {
          black: '#000000',
          card: '#121212',
          cardHover: '#181818',
          border: '#262626',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      screens: {
        mobile: '360px',
        tablet: '768px',
        desktop: '1180px',
      },
    },
  },
  plugins: [],
};
