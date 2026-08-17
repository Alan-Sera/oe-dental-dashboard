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
          950: "#070916",
          900: "#0B1024",
          850: "#10172D",
          800: "#151D34",
          700: "#24304A",
          600: "#3C4965",
          500: "#68738D",
          400: "#9CA5BA",
          300: "#CBD1E0",
          200: "#E8EAF2",
          100: "#F7F5FB"
        },
        brand: {
          50: "#EEF2FF",
          100: "#DDE5FF",
          200: "#B8C8FF",
          300: "#86A2F2",
          400: "#4F70D6",
          500: "#183F9A",
          600: "#103080",
          700: "#0C276A",
          800: "#081E52",
          900: "#06183F",
          950: "#040D24"
        },
        lavender: {
          50: "#FAF7FF",
          100: "#EFE7F7",
          200: "#D0C0E0",
          300: "#B79FCD",
          400: "#9C7EBA",
          500: "#785B9B",
          600: "#5F467D",
          700: "#49345F",
          800: "#332342",
          900: "#24172F",
          950: "#140B1D"
        },
        mint: {
          500: "#183F9A",
          600: "#103080",
          900: "#081E52"
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
