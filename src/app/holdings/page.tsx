import { HoldingsTable } from "@/components/holdings-table";
import { SummaryCards } from "@/components/summary-cards";
import { getDashboardSnapshot } from "@/server/dashboard";

export const dynamic = "force-dynamic";

export default async function HoldingsPage() {
  const { summary, holdingsSnapshot } = await getDashboardSnapshot();

  return (
    <section className="workstation-page">
      <div className="workstation-topbar">
        <div>
          <p className="eyebrow">Holdings</p>
          <h1>Positions</h1>
        </div>
      </div>

      <section className="asset-performance-grid" aria-label="Holdings status">
        <article className="metric-card">
          <p className="metric-value">{holdingsSnapshot.openPositionCount}</p>
          <p className="metric-label">Open</p>
        </article>
        <article className="metric-card">
          <p className="metric-value">{holdingsSnapshot.pricedPositionCount}</p>
          <p className="metric-label">Priced</p>
        </article>
        <article className="metric-card">
          <p className="metric-value">{holdingsSnapshot.missingPricePositionCount}</p>
          <p className="metric-label">Missing</p>
        </article>
        <article className="metric-card">
          <p className="metric-value">{holdingsSnapshot.latestPriceAsOf ?? "No cache"}</p>
          <p className="metric-label">Latest cache</p>
        </article>
      </section>

      <HoldingsTable holdings={holdingsSnapshot.holdings} />

      <SummaryCards summary={summary} />
    </section>
  );
}
