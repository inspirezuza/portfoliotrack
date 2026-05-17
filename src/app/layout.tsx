import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { UiPreferencesProvider } from "@/lib/ui/preferences";
import { getServerUiLanguage } from "@/lib/ui/server";
import { getHtmlLanguage } from "@/lib/ui/translations";
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const language = await getServerUiLanguage();
  const htmlLanguage = getHtmlLanguage(language);

  return (
    <html
      lang={htmlLanguage}
      data-language={htmlLanguage}
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem("portfoliotrack.theme");
                if (theme === "dark") {
                  document.documentElement.dataset.theme = "dark";
                }
              } catch (_) {}
            `
          }}
        />
      </head>
      <body className={inter.variable}>
        <UiPreferencesProvider initialLanguage={language}>
          <AppShell>{children}</AppShell>
        </UiPreferencesProvider>
      </body>
    </html>
  );
}
