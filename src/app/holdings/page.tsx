import { HoldingsTable } from "@/components/holdings-table";
import { SummaryCards } from "@/components/summary-cards";
import { getDashboardSnapshot } from "@/server/dashboard";

export const dynamic = "force-dynamic";

export default async function HoldingsPage() {
  const { summary, holdingsSnapshot } = await getDashboardSnapshot();
  const holdingsStatus =
    holdingsSnapshot.openPositionCount === 0
      ? {
          title: "No open positions yet",
          body: "Once you record a buy, this view will turn that ledger activity into quantities, cost basis, and quote coverage."
        }
      : holdingsSnapshot.latestPriceAsOf == null
        ? {
            title: "Quotes have not been cached yet",
            body: "Quantities and cost basis are ready now. Market value and unrealized P&L will fill in after the first successful price refresh."
          }
        : holdingsSnapshot.isPriceDataStale
          ? {
              title: "Cached prices are aging",
              body: `This table still reflects the latest successful cache from ${holdingsSnapshot.latestPriceAsOf}. Refresh from the dashboard when you want a newer snapshot.`
            }
          : {
              title: "Price coverage is current",
              body: `${holdingsSnapshot.pricedPositionCount} open holding${holdingsSnapshot.pricedPositionCount === 1 ? " has" : "s have"} cached prices as of ${holdingsSnapshot.latestPriceAsOf}.`
            };

  return (
    <section className="dashboard-grid">
      <article className="hero-card holdings-hero">
        <div className="hero-copy">
          <p className="eyebrow">Holdings workspace</p>
          <h1>Open positions, cost basis, and price coverage in one read.</h1>
          <p>
            Current positions are folded directly from your transaction ledger. Cached quotes add
            market value where available, but missing prices stay visible instead of being guessed.
          </p>
          <span className="feature-accent">Transaction truth first, price overlays second</span>
        </div>

        <div className="hero-stats">
          <article className="metric-card">
            <p className="metric-value">{holdingsSnapshot.openPositionCount}</p>
            <p className="metric-label">Open positions</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{holdingsSnapshot.pricedPositionCount}</p>
            <p className="metric-label">Positions with cached prices</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{holdingsSnapshot.missingPricePositionCount}</p>
            <p className="metric-label">Awaiting price snapshots</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{holdingsSnapshot.latestPriceAsOf ?? "No cache yet"}</p>
            <p className="metric-label">Latest cache timestamp</p>
          </article>
        </div>
      </article>

      <SummaryCards summary={summary} />

      <article className="status-banner status-banner-neutral">
        <div>
          <p className="status-banner-title">{holdingsStatus.title}</p>
          <p className="status-banner-copy">{holdingsStatus.body}</p>
        </div>
      </article>

      <HoldingsTable holdings={holdingsSnapshot.holdings} />
    </section>
  );
}
