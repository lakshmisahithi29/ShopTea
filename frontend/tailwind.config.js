/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        chai: {
          50: '#fbf7f1',
          100: '#f6ecdf',
          200: '#ebd6bd',
          300: '#dfbe96',
          400: '#d1a06d',
          500: '#c4854c',
          600: '#b46d3f',
          700: '#965535',
          800: '#794530',
          900: '#643a29',
        },
      },
    },
  },
  plugins: [],
};
