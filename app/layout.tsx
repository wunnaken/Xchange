import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "../components/AppShell";
import { AuthProvider } from "../components/AuthContext";
import { AccentSync } from "../components/AccentSync";
import { GlobalSearchShortcut } from "../components/GlobalSearchShortcut";
import { DevNotes } from "../components/DevNotes";
import { PlansFloatingTab } from "../components/PlansFloatingTab";
import { ThemeProvider } from "../components/ThemeContext";
import { ToastProvider } from "../components/ToastContext";
import { PriceProvider } from "../lib/price-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Xchange",
  description: "Where the world trades ideas. Real-time market intelligence, social communities, and risk-based investing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <AuthProvider>
            <PriceProvider>
              <ToastProvider>
                <AccentSync />
              <GlobalSearchShortcut />
              <PlansFloatingTab />
              <DevNotes />
                <AppShell>{children}</AppShell>
              </ToastProvider>
            </PriceProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
