import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/branding/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MITS — Modular IT Ticketing System",
  description:
    "KI-first IT-Service-Portal mit drei Ticket-Eingängen: klassisch, geführter Wizard und KI-Chat.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `className="dark"` matches the ThemeProvider default so the first paint is
    // already dark; suppressHydrationWarning covers next-themes rewriting it.
    <html
      lang="de"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
