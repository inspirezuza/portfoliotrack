import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { UiPreferencesProvider } from "@/lib/ui/preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: "PortfolioTrack",
  description: "A local-first portfolio tracker for focused personal investing."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" data-language="th" data-theme="light">
      <body>
        <UiPreferencesProvider>
          <AppShell>{children}</AppShell>
        </UiPreferencesProvider>
      </body>
    </html>
  );
}
