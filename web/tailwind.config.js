/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#000000',
          surface: '#0a0a0a',
          card: '#171717',
          border: 'rgba(255, 255, 255, 0.1)',
          borderHover: 'rgba(255, 255, 255, 0.2)',
          muted: '#a3a3a3'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif']
      }
    },
  },
  plugins: [],
}
