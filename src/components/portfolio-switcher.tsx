"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { PortfolioListItem } from "@/server/portfolios";

export function PortfolioSwitcher({
  canManage,
  label,
  manageLabel,
  portfolios,
  selectedPortfolioId
}: {
  canManage: boolean;
  label: string;
  manageLabel: string;
  portfolios: PortfolioListItem[];
  selectedPortfolioId: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handlePortfolioChange(portfolioId: string) {
    startTransition(async () => {
      await fetch("/api/portfolio-selection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ portfolioId })
      });
      router.refresh();
    });
  }

  return (
    <div className="portfolio-switcher" aria-label={label}>
      <select
        className="portfolio-select"
        value={selectedPortfolioId}
        onChange={(event) => handlePortfolioChange(event.target.value)}
        disabled={isPending || portfolios.length === 0}
        aria-label={label}
      >
        {portfolios.map((portfolio) => (
          <option key={portfolio.id} value={portfolio.id}>
            {portfolio.name}
          </option>
        ))}
      </select>

      {canManage ? (
        <Link href="/portfolios" className="portfolio-manage-link">
          {manageLabel}
        </Link>
      ) : null}
    </div>
  );
}
