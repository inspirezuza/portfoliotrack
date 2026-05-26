"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoadingIndicator } from "@/components/loading-indicator";
import type { PortfolioListItem } from "@/server/portfolios";

const ALL_PORTFOLIOS_SELECTION_KEY = "all";

export function PortfolioSwitcher({
  aggregateLabel,
  canManage,
  label,
  manageLabel,
  portfolios,
  selectedPortfolioKey,
  switchingLabel
}: {
  aggregateLabel: string;
  canManage: boolean;
  label: string;
  manageLabel: string;
  portfolios: PortfolioListItem[];
  selectedPortfolioKey: string;
  switchingLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isChangingPortfolio, setIsChangingPortfolio] = useState(false);
  const isBusy = isPending || isChangingPortfolio;

  function handlePortfolioChange(portfolioId: string) {
    setIsChangingPortfolio(true);
    startTransition(async () => {
      try {
        await fetch("/api/portfolio-selection", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ portfolioId })
        });
        router.refresh();
      } finally {
        setIsChangingPortfolio(false);
      }
    });
  }

  return (
    <div className="portfolio-switcher" aria-label={label} aria-busy={isBusy}>
      <select
        className="portfolio-select"
        value={selectedPortfolioKey}
        onChange={(event) => handlePortfolioChange(event.target.value)}
        disabled={isBusy || portfolios.length === 0}
        aria-label={label}
      >
        <option value={ALL_PORTFOLIOS_SELECTION_KEY}>{aggregateLabel}</option>
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

      {isBusy ? <LoadingIndicator className="portfolio-switcher-status" label={switchingLabel} size="sm" /> : null}
    </div>
  );
}
