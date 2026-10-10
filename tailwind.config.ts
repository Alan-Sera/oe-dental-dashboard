import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const themeColor = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

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
          950: themeColor("ink-950"),
          900: themeColor("ink-900"),
          850: themeColor("ink-850"),
          800: themeColor("ink-800"),
          700: themeColor("ink-700"),
          600: themeColor("ink-600"),
          500: themeColor("ink-500"),
          400: themeColor("ink-400"),
          300: themeColor("ink-300"),
          200: themeColor("ink-200"),
          100: themeColor("ink-100")
        },
        brand: {
          50: themeColor("brand-50"),
          100: themeColor("brand-100"),
          200: themeColor("brand-200"),
          300: themeColor("brand-300"),
          400: themeColor("brand-400"),
          500: themeColor("brand-500"),
          600: themeColor("brand-600"),
          700: themeColor("brand-700"),
          800: themeColor("brand-800"),
          900: themeColor("brand-900"),
          950: themeColor("brand-950")
        },
        lavender: {
          50: themeColor("lavender-50"),
          100: themeColor("lavender-100"),
          200: themeColor("lavender-200"),
          300: themeColor("lavender-300"),
          400: themeColor("lavender-400"),
          500: themeColor("lavender-500"),
          600: themeColor("lavender-600"),
          700: themeColor("lavender-700"),
          800: themeColor("lavender-800"),
          900: themeColor("lavender-900"),
          950: themeColor("lavender-950")
        },
        mint: {
          500: themeColor("mint-500"),
          600: themeColor("mint-600"),
          900: themeColor("mint-900")
        },
        coral: {
          400: themeColor("coral-400"),
          500: themeColor("coral-500"),
          900: themeColor("coral-900")
        },
        amber: {
          400: themeColor("amber-400"),
          500: themeColor("amber-500"),
          900: themeColor("amber-900")
        },
        skyline: {
          400: themeColor("skyline-400"),
          500: themeColor("skyline-500"),
          900: themeColor("skyline-900")
        },
        theme: {
          strong: themeColor("theme-strong"),
          canvas: themeColor("theme-canvas"),
          surface: themeColor("theme-surface"),
          border: themeColor("theme-border"),
          muted: themeColor("theme-muted")
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
