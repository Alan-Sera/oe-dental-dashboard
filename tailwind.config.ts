import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./types/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#080A0D",
          900: "#0D1117",
          850: "#111820",
          800: "#151D26",
          700: "#202B36",
          600: "#3C4855",
          500: "#667382",
          400: "#9AA7B5",
          300: "#CBD5E1",
          200: "#E5EAF0"
        },
        mint: {
          500: "#28B88D",
          600: "#168A6A",
          900: "#0C2B25"
        },
        coral: {
          400: "#FF8A7A",
          500: "#F05F4D",
          900: "#351713"
        },
        amber: {
          400: "#F3C96B",
          500: "#D9A737",
          900: "#312611"
        },
        skyline: {
          400: "#77B7EE",
          500: "#4A9FE5",
          900: "#10283E"
        }
      },
      boxShadow: {
        panel: "0 18px 40px rgba(0, 0, 0, 0.26)"
      }
    }
  },
  plugins: [animate]
} satisfies Config;

export default config;
