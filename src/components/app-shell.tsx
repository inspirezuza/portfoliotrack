"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { shellCopy, type UiTheme } from "@/lib/ui/translations";
import { useUiPreferences } from "@/lib/ui/preferences";

type NavItem = {
  href: "/" | "/holdings" | "/transactions";
  label: keyof typeof shellCopy.TH.nav;
  shortLabel: string;
};

const navItems: NavItem[] = [
  { href: "/", label: "dashboard", shortLabel: "ภาพ" },
  { href: "/holdings", label: "holdings", shortLabel: "หุ้น" },
  { href: "/transactions", label: "transactions", shortLabel: "ซื้อ" }
];

function isActivePath(pathname: string, href: NavItem["href"]) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { language, theme, setTheme } = useUiPreferences();
  const copy = shellCopy[language];

  return (
    <div className="app-shell">
      <div className="shell-frame">
        <aside className="shell-sidebar" aria-label="Main navigation">
          <Link href="/" className="brand-mark" aria-label="PortfolioTrack home">
            P
          </Link>

          <nav className="shell-nav" aria-label="Primary">
            {navItems.map((item) => {
              const active = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link${active ? " nav-link-active" : ""}`}
                  aria-label={copy.nav[item.label]}
                  title={copy.nav[item.label]}
                >
                  <span className="nav-short">{item.shortLabel}</span>
                  <span className="nav-full">{copy.nav[item.label]}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="shell-main">
          <header className="shell-header">
            <div className="brand-lockup">
              <p className="brand-name">PortfolioTrack</p>
              <p className="brand-subtitle">{copy.appTagline}</p>
            </div>

            <div className="shell-actions">
              <span className="language-pill" aria-label="Language">
                TH
              </span>

              <div className="preference-group" aria-label="Theme">
                {(["light", "dark"] satisfies UiTheme[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`preference-button${theme === item ? " preference-button-active" : ""}`}
                    onClick={() => setTheme(item)}
                  >
                    {copy.theme[item]}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <main className="shell-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
