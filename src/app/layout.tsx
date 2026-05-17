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

                function syncThemeButtons() {
                  var currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
                  var buttons = document.querySelectorAll('[data-preference-kind="theme"][data-preference-value]');

                  for (var index = 0; index < buttons.length; index += 1) {
                    var button = buttons[index];
                    var value = button.getAttribute("data-preference-value");
                    button.setAttribute("aria-pressed", value === currentTheme ? "true" : "false");
                  }
                }

                document.addEventListener("DOMContentLoaded", syncThemeButtons);

                document.addEventListener("click", function (event) {
                  var target = event.target;
                  if (!target || !target.closest) {
                    return;
                  }

                  var button = target.closest('[data-preference-kind="theme"][data-preference-value]');
                  if (!button) {
                    return;
                  }

                  var value = button.getAttribute("data-preference-value");

                  if (value === "light" || value === "dark") {
                    document.documentElement.dataset.theme = value;
                    localStorage.setItem("portfoliotrack.theme", value);
                    syncThemeButtons();
                  }
                }, true);
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
