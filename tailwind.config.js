/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./modules/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        vnpt: {
          blue: '#0068FF',
          dark: '#004BB5',
          light: '#E6F0FF',
        }
      }
    },
  },
  plugins: [],
}
