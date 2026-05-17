import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getAdminSession } from "@/lib/auth/admin";
import { UiPreferencesProvider } from "@/lib/ui/preferences";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

export const metadata: Metadata = {
  title: "PortfolioTrack",
  description: "A public read-only portfolio tracker with admin editing for focused personal investing."
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();

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

                function syncPreferenceButtons() {
                  var currentLanguage = document.documentElement.dataset.language === "th" ? "TH" : "EN";
                  var currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
                  var buttons = document.querySelectorAll("[data-preference-kind][data-preference-value]");

                  for (var index = 0; index < buttons.length; index += 1) {
                    var button = buttons[index];
                    var kind = button.getAttribute("data-preference-kind");
                    var value = button.getAttribute("data-preference-value");
                    var isPressed =
                      (kind === "language" && value === currentLanguage) ||
                      (kind === "theme" && value === currentTheme);

                    button.setAttribute("aria-pressed", isPressed ? "true" : "false");
                  }
                }

                document.addEventListener("DOMContentLoaded", syncPreferenceButtons);

                document.addEventListener("click", function (event) {
                  var target = event.target;
                  if (!target || !target.closest) {
                    return;
                  }

                  var button = target.closest("[data-preference-kind][data-preference-value]");
                  if (!button) {
                    return;
                  }

                  var kind = button.getAttribute("data-preference-kind");
                  var value = button.getAttribute("data-preference-value");

                  if (kind === "theme" && (value === "light" || value === "dark")) {
                    document.documentElement.dataset.theme = value;
                    localStorage.setItem("portfoliotrack.theme", value);
                    syncPreferenceButtons();
                  }

                  if (kind === "language" && (value === "TH" || value === "EN")) {
                    document.documentElement.dataset.language = value.toLowerCase();
                    document.documentElement.lang = value === "TH" ? "th" : "en";
                    localStorage.setItem("portfoliotrack.language", value);
                    syncPreferenceButtons();
                  }
                }, true);
              } catch (_) {}
            `
          }}
        />
      </head>
      <body className={inter.variable}>
        <UiPreferencesProvider>
          <AppShell isAdmin={session != null}>{children}</AppShell>
        </UiPreferencesProvider>
      </body>
    </html>
  );
}
