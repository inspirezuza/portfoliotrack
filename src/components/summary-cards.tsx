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
    return "ยังไม่มีสถานะเปิด";
  }

  if (summary.missingPricePositionCount === 0) {
    return summary.latestPriceAsOf
      ? `มีราคาในแคชครบ ${summary.pricedPositionCount} สถานะ ณ ${summary.latestPriceAsOf}`
      : `มีราคาในแคชครบ ${summary.pricedPositionCount} สถานะ`;
  }

  const awaitingList = summary.awaitingPriceSymbols.slice(0, 3).join(", ");
  const suffix =
    summary.awaitingPriceSymbols.length > 3
      ? ` +อีก ${summary.awaitingPriceSymbols.length - 3}`
      : "";

  return `มีราคาแล้ว ${summary.pricedPositionCount} จาก ${summary.openPositionCount} สถานะ รอ ${awaitingList}${suffix}`;
}

function formatCurrencyBreakdown(
  summary: DashboardSummary,
  key: "totalCostBasis" | "totalMarketValue" | "totalUnrealizedPnl"
) {
  return summary.currencyBreakdown
    .map((entry) => {
      const value = entry[key];

      if (value == null) {
        return `${entry.currency}: รอราคา`;
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
      label: "สถานะเปิด",
      value: summary.openPositionCount.toString(),
      detail:
        summary.openPositionCount === 0
          ? "ยังไม่มีรายการถือครองที่เปิดอยู่"
          : `มี ${summary.openPositionCount} สถานะที่ยังเปิดจากรายการซื้อขาย`
    },
    {
      label: "ต้นทุนสถานะเปิด",
      value:
        summary.totalCostBasis == null
          ? "หลายสกุลเงิน"
          : formatCurrency(summary.totalCostBasis, {
              currency: summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY
            }),
      detail:
        summary.totalCostBasis == null
          ? formatCurrencyBreakdown(summary, "totalCostBasis")
          : "คิดจากสถานะที่ยังเปิดอยู่เท่านั้น"
    },
    {
      label: "มูลค่าตลาด",
      value:
        summary.totalMarketValue == null
          ? marketValueIsMixedCurrency
            ? "หลายสกุลเงิน"
            : "รอราคา"
          : formatCurrency(summary.totalMarketValue, {
              currency: summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY
            }),
      detail:
        summary.totalMarketValue == null
          ? marketValueIsMixedCurrency
            ? formatCurrencyBreakdown(summary, "totalMarketValue")
            : `${getPriceCoverageDetail(summary)} ${formatCurrencyBreakdown(summary, "totalMarketValue")}`
          : summary.latestPriceAsOf
            ? `อ้างอิงราคาที่แคชไว้ ณ ${summary.latestPriceAsOf}`
            : "อ้างอิงราคาที่แคชไว้"
    },
    {
      label: "Unrealized P&L",
      value:
        summary.totalUnrealizedPnl == null
          ? unrealizedPnlIsMixedCurrency
            ? "หลายสกุลเงิน"
            : "รอราคา"
          : formatCurrency(summary.totalUnrealizedPnl, {
              currency: summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY
            }),
      tone: getPnlTone(summary.totalUnrealizedPnl),
      detail:
        summary.totalUnrealizedPnl == null
          ? unrealizedPnlIsMixedCurrency
            ? formatCurrencyBreakdown(summary, "totalUnrealizedPnl")
            : `${getPriceCoverageDetail(summary)} ${formatCurrencyBreakdown(summary, "totalUnrealizedPnl")}`
          : "กำไรหรือขาดทุนของสถานะเปิดเทียบกับต้นทุน"
    },
    {
      label: "Realized P&L",
      value:
        summary.totalRealizedPnl == null
          ? "หลายสกุลเงิน"
          : formatCurrency(summary.totalRealizedPnl, {
              currency: summary.realizedBreakdown[0]?.currency ?? DEFAULT_DISPLAY_CURRENCY
            }),
      tone: getPnlTone(summary.totalRealizedPnl),
      detail:
        summary.totalRealizedPnl == null
          ? formatRealizedBreakdown(summary)
          : "รวมส่วนที่ปิดจากรายการขายทั้งหมดจนถึงตอนนี้"
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
