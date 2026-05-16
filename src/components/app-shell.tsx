"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { languages, shellCopy, type UiTheme } from "@/lib/ui/translations";
import { useUiPreferences } from "@/lib/ui/preferences";

type NavItem = {
  href: "/" | "/holdings" | "/transactions";
  label: keyof typeof shellCopy.TH.nav;
  icon: "dashboard" | "holdings" | "transactions";
};

const navItems: NavItem[] = [
  { href: "/", label: "dashboard", icon: "dashboard" },
  { href: "/holdings", label: "holdings", icon: "holdings" },
  { href: "/transactions", label: "transactions", icon: "transactions" }
];

function isActivePath(pathname: string, href: NavItem["href"]) {
  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/holdings" && pathname.startsWith("/assets/")) {
    return true;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { language, theme, setLanguage, setTheme } = useUiPreferences();
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
                  <span className="nav-icon" data-nav-icon={item.icon} aria-hidden="true" />
                  <span className="nav-short">{copy.navShort[item.label]}</span>
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
              {copy.appTagline ? <p className="brand-subtitle">{copy.appTagline}</p> : null}
            </div>

            <div className="shell-actions">
              <div className="preference-group" aria-label={copy.language}>
                {languages.map((item) => (
                  <button
                    key={item}
                    type="button"
                    data-preference-kind="language"
                    data-preference-value={item}
                    className="preference-button"
                    onClick={() => setLanguage(item)}
                    aria-pressed={language === item}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="preference-group" aria-label={copy.themeLabel}>
                {(["light", "dark"] satisfies UiTheme[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    data-preference-kind="theme"
                    data-preference-value={item}
                    className="preference-button"
                    onClick={() => setTheme(item)}
                    aria-pressed={theme === item}
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
