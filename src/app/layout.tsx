import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { UiPreferencesProvider } from "@/lib/ui/preferences";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

export const metadata: Metadata = {
  title: "PortfolioTrack",
  description: "A local-first portfolio tracker for focused personal investing."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-language="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem("portfoliotrack.theme");
                var language = localStorage.getItem("portfoliotrack.language");
                if (theme === "dark") {
                  document.documentElement.dataset.theme = "dark";
                }
                if (language === "TH") {
                  document.documentElement.dataset.language = "th";
                  document.documentElement.lang = "th";
                }
              } catch (_) {}
            `
          }}
        />
      </head>
      <body className={inter.variable}>
        <UiPreferencesProvider>
          <AppShell>{children}</AppShell>
        </UiPreferencesProvider>
      </body>
    </html>
  );
}
