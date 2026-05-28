import { formatCurrency } from "@/lib/format";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { DashboardSummary } from "@/server/dashboard";

type SummaryCardsProps = {
  language: UiLanguage;
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

function getPriceCoverageDetail(
  summary: DashboardSummary,
  copy: ReturnType<typeof getUiCopy>["holdings"]["summary"],
) {
  if (summary.openPositionCount === 0) {
    return copy.priceCoverageNoOpen;
  }

  if (summary.missingPricePositionCount === 0) {
    return summary.latestPriceAsOf
      ? copy.priceCoverageFullAsOf(summary.pricedPositionCount, summary.latestPriceAsOf)
      : copy.priceCoverageFull(summary.pricedPositionCount);
  }

  const awaitingList = summary.awaitingPriceSymbols.slice(0, 3).join(", ");
  const suffix =
    summary.awaitingPriceSymbols.length > 3
      ? copy.moreSymbols(summary.awaitingPriceSymbols.length - 3)
      : "";

  return copy.priceCoveragePartial(
    summary.pricedPositionCount,
    summary.openPositionCount,
    `${awaitingList}${suffix}`,
  );
}

function formatCurrencyBreakdown(
  summary: DashboardSummary,
  key: "totalCostBasis" | "totalMarketValue" | "totalUnrealizedPnl",
  locale: string,
  copy: ReturnType<typeof getUiCopy>["holdings"]["summary"],
) {
  return summary.currencyBreakdown
    .map((entry) => {
      const value = entry[key];

      if (value == null) {
        return copy.currencyBreakdown(entry.currency, copy.waitingForPrice);
      }

      return copy.currencyBreakdown(
        entry.currency,
        formatCurrency(value, { currency: entry.currency, locale }),
      );
    })
    .join(" - ");
}

function formatRealizedBreakdown(
  summary: DashboardSummary,
  locale: string,
  copy: ReturnType<typeof getUiCopy>["holdings"]["summary"],
) {
  return summary.realizedBreakdown
    .map((entry) =>
      copy.currencyBreakdown(
        entry.currency,
        formatCurrency(entry.totalRealizedPnl, { currency: entry.currency, locale }),
      ),
    )
    .join(" - ");
}

function buildCards(summary: DashboardSummary, language: UiLanguage): SummaryCardConfig[] {
  const copy = getUiCopy(language).holdings.summary;
  const locale = getUiLocale(language);
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
      label: copy.openPositions,
      value: summary.openPositionCount.toString(),
      detail:
        summary.openPositionCount === 0
          ? copy.noOpenHoldings
          : copy.openLedger(summary.openPositionCount),
    },
    {
      label: copy.openCostBasis,
      value:
        summary.totalCostBasis == null
          ? copy.mixedCurrency
          : formatCurrency(summary.totalCostBasis, {
              currency: summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY,
              locale,
            }),
      detail:
        summary.totalCostBasis == null
          ? formatCurrencyBreakdown(summary, "totalCostBasis", locale, copy)
          : copy.calculatedOpenOnly,
    },
    {
      label: copy.marketValue,
      value:
        summary.totalMarketValue == null
          ? marketValueIsMixedCurrency
            ? copy.mixedCurrency
            : copy.waiting
          : formatCurrency(summary.totalMarketValue, {
              currency: summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY,
              locale,
            }),
      detail:
        summary.totalMarketValue == null
          ? marketValueIsMixedCurrency
            ? formatCurrencyBreakdown(summary, "totalMarketValue", locale, copy)
            : `${getPriceCoverageDetail(summary, copy)} ${formatCurrencyBreakdown(summary, "totalMarketValue", locale, copy)}`
          : summary.latestPriceAsOf
            ? copy.usingCachedPricesAsOf(summary.latestPriceAsOf)
            : copy.usingCachedPrices,
    },
    {
      label: copy.unrealizedPnl,
      value:
        summary.totalUnrealizedPnl == null
          ? unrealizedPnlIsMixedCurrency
            ? copy.mixedCurrency
            : copy.waiting
          : formatCurrency(summary.totalUnrealizedPnl, {
              currency: summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY,
              locale,
            }),
      tone: getPnlTone(summary.totalUnrealizedPnl),
      detail:
        summary.totalUnrealizedPnl == null
          ? unrealizedPnlIsMixedCurrency
            ? formatCurrencyBreakdown(summary, "totalUnrealizedPnl", locale, copy)
            : `${getPriceCoverageDetail(summary, copy)} ${formatCurrencyBreakdown(summary, "totalUnrealizedPnl", locale, copy)}`
          : copy.openGainLoss,
    },
    {
      label: copy.realizedPnl,
      value:
        summary.totalRealizedPnl == null
          ? copy.mixedCurrency
          : formatCurrency(summary.totalRealizedPnl, {
              currency: summary.realizedBreakdown[0]?.currency ?? DEFAULT_DISPLAY_CURRENCY,
              locale,
            }),
      tone: getPnlTone(summary.totalRealizedPnl),
      detail:
        summary.totalRealizedPnl == null
          ? formatRealizedBreakdown(summary, locale, copy)
          : copy.closedTradeResult,
    },
  ];
}

export function SummaryCards({ language, summary }: SummaryCardsProps) {
  const cards = buildCards(summary, language);

  return (
    <div className="summary-card-grid">
      {cards.map((card) => (
        <article key={card.label} className="metric-card summary-card">
          <p className="eyebrow">{card.label}</p>
          <p
            className={`metric-value summary-value${card.tone ? ` summary-value-${card.tone}` : ""}`}
          >
            {card.value}
          </p>
          <p className="metric-label">{card.detail}</p>
        </article>
      ))}
    </div>
  );
}
