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

const DEFAULT_DISPLAY_CURRENCY = "THB";

function getPnlTone(value: number | null): SummaryCardConfig["tone"] {
  if (value == null || value === 0) {
    return "neutral";
  }

  return value > 0 ? "positive" : "negative";
}

function getPriceCoverageDetail(summary: DashboardSummary) {
  if (summary.openPositionCount === 0) {
    return "No open positions yet";
  }

  if (summary.missingPricePositionCount === 0) {
    return summary.latestPriceAsOf
      ? `Cached prices cover all ${summary.pricedPositionCount} positions as of ${summary.latestPriceAsOf}`
      : `Cached prices cover all ${summary.pricedPositionCount} positions`;
  }

  const awaitingList = summary.awaitingPriceSymbols.slice(0, 3).join(", ");
  const suffix =
    summary.awaitingPriceSymbols.length > 3
      ? ` +${summary.awaitingPriceSymbols.length - 3} more`
      : "";

  return `${summary.pricedPositionCount} of ${summary.openPositionCount} positions priced; waiting for ${awaitingList}${suffix}`;
}

function formatCurrencyBreakdown(
  summary: DashboardSummary,
  key: "totalCostBasis" | "totalMarketValue" | "totalUnrealizedPnl"
) {
  return summary.currencyBreakdown
    .map((entry) => {
      const value = entry[key];

      if (value == null) {
        return `${entry.currency}: waiting for price`;
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
          ? "No open holdings yet"
          : `${summary.openPositionCount} positions are still open from the trade ledger`
    },
    {
      label: "Open cost basis",
      value:
        summary.totalCostBasis == null
          ? "Mixed currency"
          : formatCurrency(summary.totalCostBasis, {
              currency: summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY
            }),
      detail:
        summary.totalCostBasis == null
          ? formatCurrencyBreakdown(summary, "totalCostBasis")
          : "Calculated from open positions only"
    },
    {
      label: "Market value",
      value:
        summary.totalMarketValue == null
          ? marketValueIsMixedCurrency
            ? "Mixed currency"
            : "Waiting"
          : formatCurrency(summary.totalMarketValue, {
              currency: summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY
            }),
      detail:
        summary.totalMarketValue == null
          ? marketValueIsMixedCurrency
            ? formatCurrencyBreakdown(summary, "totalMarketValue")
            : `${getPriceCoverageDetail(summary)} ${formatCurrencyBreakdown(summary, "totalMarketValue")}`
          : summary.latestPriceAsOf
            ? `Using cached prices as of ${summary.latestPriceAsOf}`
            : "Using cached prices"
    },
    {
      label: "Unrealized P&L",
      value:
        summary.totalUnrealizedPnl == null
          ? unrealizedPnlIsMixedCurrency
            ? "Mixed currency"
            : "Waiting"
          : formatCurrency(summary.totalUnrealizedPnl, {
              currency: summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY
            }),
      tone: getPnlTone(summary.totalUnrealizedPnl),
      detail:
        summary.totalUnrealizedPnl == null
          ? unrealizedPnlIsMixedCurrency
            ? formatCurrencyBreakdown(summary, "totalUnrealizedPnl")
            : `${getPriceCoverageDetail(summary)} ${formatCurrencyBreakdown(summary, "totalUnrealizedPnl")}`
          : "Open-position gain or loss versus cost"
    },
    {
      label: "Realized P&L",
      value:
        summary.totalRealizedPnl == null
          ? "Mixed currency"
          : formatCurrency(summary.totalRealizedPnl, {
              currency: summary.realizedBreakdown[0]?.currency ?? DEFAULT_DISPLAY_CURRENCY
            }),
      tone: getPnlTone(summary.totalRealizedPnl),
      detail:
        summary.totalRealizedPnl == null
          ? formatRealizedBreakdown(summary)
          : "Closed-trade result through now"
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
