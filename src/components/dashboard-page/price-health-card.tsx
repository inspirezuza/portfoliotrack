import { PendingSubmitButton } from "@/components/pending-submit-button";
import type { getUiCopy } from "@/lib/ui/copy";

type CacheDateParts = {
  date: string;
  time: string | null;
};

type DashboardPriceHealthCardProps = {
  closedPositionCount: number;
  copy: ReturnType<typeof getUiCopy>;
  latestMarketDataAsOf: string | null;
  latestPriceLabel: CacheDateParts;
  missingPricePositionCount: number;
  pricedPositionCount: number;
  priceFreshnessLabel: string;
  refreshRedirectPath: string;
  showRefresh: boolean;
};

export function DashboardPriceHealthCard({
  closedPositionCount,
  copy,
  latestMarketDataAsOf,
  latestPriceLabel,
  missingPricePositionCount,
  pricedPositionCount,
  priceFreshnessLabel,
  refreshRedirectPath,
  showRefresh,
}: DashboardPriceHealthCardProps) {
  return (
    <article className="surface-card price-health-card">
      <div className="side-card-header">
        <div>
          <p className="eyebrow">{copy.dashboard.prices}</p>
          <h2 className="side-card-title">{copy.dashboard.coverage}</h2>
        </div>
        <span className="state-pill state-pill-muted">{priceFreshnessLabel}</span>
      </div>

      <div className="compact-stat-grid">
        <div>
          <span>{copy.dashboard.priced}</span>
          <strong>{pricedPositionCount}</strong>
        </div>
        <div>
          <span>{copy.dashboard.missing}</span>
          <strong>{missingPricePositionCount}</strong>
        </div>
        <div>
          <span>{copy.dashboard.closed}</span>
          <strong>{closedPositionCount}</strong>
        </div>
        <div>
          <span>{copy.dashboard.latestCache}</span>
          <strong className="cache-date-stack">
            <span>{latestPriceLabel.date}</span>
            {latestPriceLabel.time == null ? null : (
              <time dateTime={latestMarketDataAsOf ?? undefined}>{latestPriceLabel.time}</time>
            )}
          </strong>
        </div>
      </div>

      {showRefresh ? (
        <form action="/api/market-data/refresh" method="post" className="refresh-form">
          <input type="hidden" name="redirectTo" value={refreshRedirectPath} />
          <PendingSubmitButton
            className="secondary-button"
            pendingLabel={copy.dashboard.refreshing}
          >
            {copy.dashboard.updateMarketData}
          </PendingSubmitButton>
        </form>
      ) : null}
    </article>
  );
}
