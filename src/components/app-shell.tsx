"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem =
  {
    href: "/" | "/holdings" | "/transactions";
    label: string;
  };

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/holdings", label: "Holdings" },
  { href: "/transactions", label: "Transactions" }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <div className="shell-frame">
        <header className="shell-header">
          <div className="brand-lockup">
            <p className="eyebrow">PortfolioTrack</p>
            <h1 className="brand-title">Personal investing, kept local.</h1>
            <p className="brand-subtitle">
              A desktop-first tracker for transactions, holdings, and benchmark
              context without the noise of a generic finance dashboard.
            </p>
          </div>

          <nav className="shell-nav" aria-label="Primary">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const className = `nav-link${isActive ? " nav-link-active" : ""}`;

              return (
                <Link key={`${item.label}-${item.href}`} href={item.href} className={className}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
