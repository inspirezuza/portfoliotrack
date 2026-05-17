"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { getUiCopy } from "@/lib/ui/copy";
import { useUiPreferences } from "@/lib/ui/preferences";
import { languages, type UiTheme } from "@/lib/ui/translations";

type NavItem = {
  href: "/" | "/holdings" | "/transactions";
  label: "dashboard" | "holdings" | "transactions";
  icon: NavIconName;
};

type NavIconName = "dashboard" | "holdings" | "transactions";
type ThemeIconName = UiTheme;

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

function NavIcon({ name }: { name: NavIconName }) {
  const iconPaths: Record<NavIconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3.25" y="3.25" width="7" height="7.6" rx="2.2" />
        <rect x="13.75" y="3.25" width="7" height="4.9" rx="2.2" />
        <rect x="13.75" y="11.55" width="7" height="9.2" rx="2.2" />
        <rect x="3.25" y="14.25" width="7" height="6.5" rx="2.2" />
      </>
    ),
    holdings: (
      <>
        <path d="M11.6 3.3a8.7 8.7 0 1 0 8.7 8.7h-8.7Z" />
        <path d="M14.3 3.8a8.7 8.7 0 0 1 5.9 5.9h-5.9Z" />
        <path d="M7.6 12.7h3.1" />
        <path d="M7.6 16h6.4" />
      </>
    ),
    transactions: (
      <>
        <path d="M6.2 3.5h10.2a2.2 2.2 0 0 1 2.2 2.2v14l-2.4-1.2-2.3 1.2-2.3-1.2-2.3 1.2-2.3-1.2-2.4 1.2v-14a2.2 2.2 0 0 1 2.2-2.2Z" />
        <path d="M8.2 8.2h7.6" />
        <path d="M8.2 11.7h7.6" />
        <path d="m10.1 15.6-1.7-1.7 1.7-1.7" />
        <path d="M8.5 13.9h7" />
        <path d="m13.9 15.6 1.7-1.7-1.7-1.7" />
      </>
    )
  };

  return (
    <span className="nav-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        {iconPaths[name]}
      </svg>
    </span>
  );
}

function ThemeIcon({ name }: { name: ThemeIconName }) {
  const iconPaths: Record<ThemeIconName, ReactNode> = {
    light: (
      <>
        <circle cx="12" cy="12" r="4.1" />
        <path d="M12 2.9v2" />
        <path d="M12 19.1v2" />
        <path d="m4.3 4.3 1.4 1.4" />
        <path d="m18.3 18.3 1.4 1.4" />
        <path d="M2.9 12h2" />
        <path d="M19.1 12h2" />
        <path d="m4.3 19.7 1.4-1.4" />
        <path d="m18.3 5.7 1.4-1.4" />
      </>
    ),
    dark: (
      <path d="M20.2 14.2a7.5 7.5 0 0 1-10.4-10.4 8.2 8.2 0 1 0 10.4 10.4Z" />
    )
  };

  return (
    <span className="preference-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        {iconPaths[name]}
      </svg>
    </span>
  );
}

export function AppShell({ children, isAdmin }: { children: ReactNode; isAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { language, theme, setLanguage, setTheme } = useUiPreferences();
  const copy = getUiCopy(language).shell;

  return (
    <div className="app-shell">
      <div className="shell-frame">
        <aside className="shell-sidebar" aria-label={copy.mainNavigation}>
          <Link href="/" className="brand-mark" aria-label={copy.homeLabel}>
            P
          </Link>

          <nav className="shell-nav" aria-label={copy.primaryNavigation}>
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
                  <NavIcon name={item.icon} />
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
                    onClick={() => {
                      setLanguage(item);
                      router.refresh();
                    }}
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
                    className="preference-button preference-icon-button"
                    onClick={() => setTheme(item)}
                    aria-pressed={theme === item}
                    aria-label={copy.theme[item]}
                    title={copy.theme[item]}
                  >
                    <ThemeIcon name={item} />
                  </button>
                ))}
              </div>

              {isAdmin ? (
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="auth-button">
                    Logout
                  </button>
                </form>
              ) : null}
            </div>
          </header>

          <main className="shell-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
