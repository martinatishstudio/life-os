import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Overmind brand palette
        teal: {
          950: '#071e1c',
          900: '#0c3230',
          800: '#10423f',
          700: '#15524e',
          600: '#1a635e',
          500: '#1f756f',
          400: '#2a9990',
          300: '#3dbfb5',
          200: '#7dd9d3',
          100: '#b8efeb',
          50:  '#e8faf9',
        },
        lime: {
          400: '#b8f04a',
          300: '#ccf570',
          200: '#dff9a0',
          100: '#f0fcd8',
        },
        sunset: {
          500: '#e8855a',
          400: '#f0a07a',
          300: '#f5bfa0',
          100: '#fdeee5',
        },
        cloud: {
          500: '#6b9fc8',
          400: '#8ab5d8',
          300: '#aacce8',
          100: '#e5f2fb',
        },
      },
    },
  },
  plugins: [],
}
export default config
