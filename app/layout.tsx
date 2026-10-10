import type { Metadata } from "next";
import Script from "next/script";

import { ThemeProvider } from "@/components/theme-provider";
import { THEME_STORAGE_KEY } from "@/lib/theme-preference";

import "./globals.css";

export const metadata: Metadata = {
  title: "OE Dental Dashboard",
  description: "Dashboard local para clínica dental"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <Script id="oe-theme-bootstrap" strategy="beforeInteractive">
          {`try { const preference = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); const root = document.documentElement; root.classList.toggle("dark", preference === "dark"); root.classList.toggle("light", preference !== "dark"); } catch {}`}
        </Script>
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
