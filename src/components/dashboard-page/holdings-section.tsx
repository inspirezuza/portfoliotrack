import { DeferredHoldingsTable } from "@/components/dashboard-deferred-widgets";
import { formatCacheDateLabel } from "@/components/dashboard-page/formatting";
import { SummaryCards } from "@/components/summary-cards";
import type { getUiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";
import type { DashboardSummary } from "@/server/dashboard";
import type { HoldingsSnapshot } from "@/server/holdings";

type DashboardHoldingsSectionProps = {
  canEdit: boolean;
  canRefresh: boolean;
  copy: ReturnType<typeof getUiCopy>;
  holdingsSnapshot: HoldingsSnapshot;
  language: UiLanguage;
  locale: string;
  selectedPortfolioName: string;
  summary: DashboardSummary;
};

export function DashboardHoldingsSection({
  canEdit,
  canRefresh,
  copy,
  holdingsSnapshot,
  language,
  locale,
  selectedPortfolioName,
  summary,
}: DashboardHoldingsSectionProps) {
  return (
    <section className="dashboard-holdings-section" aria-labelledby="dashboard-holdings-title">
      <div className="dashboard-holdings-header">
        <div>
          <p className="eyebrow">{copy.holdings.pageEyebrow}</p>
          <h2 id="dashboard-holdings-title" className="section-title">
            {copy.holdings.pageTitle}
          </h2>
        </div>
        <span className="state-pill state-pill-muted">{selectedPortfolioName}</span>
      </div>

      <section
        className="asset-performance-grid dashboard-holdings-status"
        aria-label={copy.holdings.statusLabel}
      >
        <article className="metric-card dashboard-status-card">
          <p className="metric-value">{holdingsSnapshot.openPositionCount}</p>
          <p className="metric-label">{copy.holdings.open}</p>
        </article>
        <article className="metric-card dashboard-status-card">
          <p className="metric-value">{holdingsSnapshot.pricedPositionCount}</p>
          <p className="metric-label">{copy.holdings.priced}</p>
        </article>
        <article className="metric-card dashboard-status-card">
          <p className="metric-value">{holdingsSnapshot.missingPricePositionCount}</p>
          <p className="metric-label">{copy.holdings.missing}</p>
        </article>
        <article className="metric-card dashboard-status-card">
          <p className="metric-value metric-value-compact">
            {formatCacheDateLabel(holdingsSnapshot.latestPriceAsOf, locale, copy.shared.noCache)}
          </p>
          <p className="metric-label">{copy.holdings.latestCache}</p>
        </article>
      </section>

      <DeferredHoldingsTable
        holdings={holdingsSnapshot.holdings}
        language={language}
        canEdit={canEdit}
        canRefresh={canRefresh}
      />

      <SummaryCards language={language} summary={summary} />
    </section>
  );
}
