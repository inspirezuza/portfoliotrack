import { formatCurrency } from "@/lib/format";
import type { DashboardSummary } from "@/server/dashboard";

type SummaryCardsProps = {
  summary: DashboardSummary;
};

type SummaryCardConfig = {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
  detail: string;
};

function getPnlTone(value: number | null): SummaryCardConfig["tone"] {
  if (value == null || value === 0) {
    return "neutral";
  }

  return value > 0 ? "positive" : "negative";
}

function getPriceCoverageDetail(summary: DashboardSummary) {
  if (summary.openPositionCount === 0) {
    return "No open positions yet.";
  }

  if (summary.missingPricePositionCount === 0) {
    return summary.latestPriceAsOf
      ? `All ${summary.pricedPositionCount} open positions priced as of ${summary.latestPriceAsOf}.`
      : `All ${summary.pricedPositionCount} open positions have cached prices.`;
  }

  const awaitingList = summary.awaitingPriceSymbols.slice(0, 3).join(", ");
  const suffix =
    summary.awaitingPriceSymbols.length > 3
      ? ` +${summary.awaitingPriceSymbols.length - 3} more`
      : "";

  return `${summary.pricedPositionCount} of ${summary.openPositionCount} open positions priced. Awaiting ${awaitingList}${suffix}.`;
}

function formatCurrencyBreakdown(
  summary: DashboardSummary,
  key: "totalCostBasis" | "totalMarketValue" | "totalUnrealizedPnl"
) {
  return summary.currencyBreakdown
    .map((entry) => {
      const value = entry[key];

      if (value == null) {
        return `${entry.currency}: awaiting prices`;
      }

      return `${entry.currency}: ${formatCurrency(value, { currency: entry.currency })}`;
    })
    .join(" - ");
}

function formatRealizedBreakdown(summary: DashboardSummary) {
  return summary.realizedBreakdown
    .map((entry) =>
      `${entry.currency}: ${formatCurrency(entry.totalRealizedPnl, { currency: entry.currency })}`
    )
    .join(" - ");
}

function buildCards(summary: DashboardSummary): SummaryCardConfig[] {
  const marketValueIsMixedCurrency =
    summary.totalMarketValue == null &&
    summary.openPositionCount > 0 &&
    summary.missingPricePositionCount === 0 &&
    summary.currencyBreakdown.length > 1;
  const unrealizedPnlIsMixedCurrency =
    summary.totalUnrealizedPnl == null &&
    summary.openPositionCount > 0 &&
    summary.missingPricePositionCount === 0 &&
    summary.currencyBreakdown.length > 1;

  return [
    {
      label: "Open positions",
      value: summary.openPositionCount.toString(),
      detail:
        summary.openPositionCount === 0
          ? "No active holdings yet."
          : `${summary.openPositionCount} positions remain open from recorded trades.`
    },
    {
      label: "Open cost basis",
      value:
        summary.totalCostBasis == null
          ? "Multi-currency"
          : formatCurrency(summary.totalCostBasis, {
              currency: summary.openPositionCurrency ?? "USD"
            }),
      detail:
        summary.totalCostBasis == null
          ? formatCurrencyBreakdown(summary, "totalCostBasis")
          : "Cost basis from currently open positions only."
    },
    {
      label: "Market value",
      value:
        summary.totalMarketValue == null
          ? marketValueIsMixedCurrency
            ? "Multi-currency"
            : "Awaiting prices"
          : formatCurrency(summary.totalMarketValue, {
              currency: summary.openPositionCurrency ?? "USD"
            }),
      detail:
        summary.totalMarketValue == null
          ? marketValueIsMixedCurrency
            ? formatCurrencyBreakdown(summary, "totalMarketValue")
            : `${getPriceCoverageDetail(summary)} ${formatCurrencyBreakdown(summary, "totalMarketValue")}`
          : summary.latestPriceAsOf
            ? `Based on cached prices as of ${summary.latestPriceAsOf}.`
            : "Based on cached prices."
    },
    {
      label: "Unrealized P&L",
      value:
        summary.totalUnrealizedPnl == null
          ? unrealizedPnlIsMixedCurrency
            ? "Multi-currency"
            : "Awaiting prices"
          : formatCurrency(summary.totalUnrealizedPnl, {
              currency: summary.openPositionCurrency ?? "USD"
            }),
      tone: getPnlTone(summary.totalUnrealizedPnl),
      detail:
        summary.totalUnrealizedPnl == null
          ? unrealizedPnlIsMixedCurrency
            ? formatCurrencyBreakdown(summary, "totalUnrealizedPnl")
            : `${getPriceCoverageDetail(summary)} ${formatCurrencyBreakdown(summary, "totalUnrealizedPnl")}`
          : "Open-position gain or loss versus cost basis."
    },
    {
      label: "Realized P&L",
      value:
        summary.totalRealizedPnl == null
          ? "Multi-currency"
          : formatCurrency(summary.totalRealizedPnl, {
              currency: summary.realizedBreakdown[0]?.currency ?? "USD"
            }),
      tone: getPnlTone(summary.totalRealizedPnl),
      detail:
        summary.totalRealizedPnl == null
          ? formatRealizedBreakdown(summary)
          : "Includes all closed portions of sell transactions to date."
    }
  ];
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  const cards = buildCards(summary);

  return (
    <div className="summary-card-grid">
      {cards.map((card) => (
        <article key={card.label} className="metric-card summary-card">
          <p className="eyebrow">{card.label}</p>
          <p className={`metric-value summary-value${card.tone ? ` summary-value-${card.tone}` : ""}`}>
            {card.value}
          </p>
          <p className="metric-label">{card.detail}</p>
        </article>
      ))}
    </div>
  );
}
