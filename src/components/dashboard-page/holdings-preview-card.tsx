import Link from "next/link";
import { DeferredHoldingsAllocationChart } from "@/components/dashboard-deferred-widgets";
import { formatPercentRatio, formatQuantity } from "@/lib/format";
import type { getUiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";
import type { HoldingRow } from "@/server/holdings";

type DashboardHoldingsPreviewCardProps = {
  copy: ReturnType<typeof getUiCopy>;
  holdings: HoldingRow[];
  language: UiLanguage;
  leadingHoldings: HoldingRow[];
  locale: string;
  openPositionCount: number;
};

export function DashboardHoldingsPreviewCard({
  copy,
  holdings,
  language,
  leadingHoldings,
  locale,
  openPositionCount,
}: DashboardHoldingsPreviewCardProps) {
  return (
    <article className="surface-card holdings-preview-card">
      <div className="side-card-header">
        <div>
          <p className="eyebrow">{copy.dashboard.holdings}</p>
          <h2 className="side-card-title">{copy.dashboard.openPositions}</h2>
        </div>
        <span className="state-pill state-pill-muted">
          {copy.shared.positionCount(openPositionCount)}
        </span>
      </div>

      {leadingHoldings.length === 0 ? (
        <div className="empty-panel">
          <strong>{copy.shared.noOpenPositions}</strong>
        </div>
      ) : (
        <>
          <DeferredHoldingsAllocationChart holdings={holdings} language={language} />

          <ul className="holding-bars">
            {leadingHoldings.map((holding) => (
              <li key={holding.instrumentId}>
                <div className="holding-bar-row">
                  <div>
                    <Link
                      href={`/assets/${encodeURIComponent(holding.symbol)}`}
                      className="holding-symbol"
                    >
                      {holding.symbol}
                    </Link>
                    <span>{holding.displayName}</span>
                  </div>
                  <strong>
                    {holding.portfolioWeight == null
                      ? formatQuantity(holding.quantity, { locale })
                      : formatPercentRatio(holding.portfolioWeight, {
                          locale,
                          maximumFractionDigits: 0,
                          minimumFractionDigits: 0,
                        })}
                  </strong>
                </div>
                <div className="holding-bar-track">
                  <span
                    style={{
                      width:
                        holding.portfolioWeight == null
                          ? "18%"
                          : `${Math.min(100, Math.max(3, holding.portfolioWeight * 100))}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
