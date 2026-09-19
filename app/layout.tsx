import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "OE Dental Dashboard",
  description: "Dashboard local para clínica dental"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
