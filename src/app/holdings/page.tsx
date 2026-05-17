import { HoldingsTable } from "@/components/holdings-table";
import { SummaryCards } from "@/components/summary-cards";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getDashboardSnapshot } from "@/server/dashboard";

export const dynamic = "force-dynamic";

function formatCacheDateLabel(value: string | null) {
  if (value == null) {
    return "No cache";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Bangkok",
    year: "numeric"
  }).format(date);
}

export default async function HoldingsPage() {
  const isAdmin = await isAdminAuthenticated();
  const { summary, holdingsSnapshot } = await getDashboardSnapshot({
    ensureFresh: isAdmin
  });

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
          <p className="metric-value metric-value-compact">
            {formatCacheDateLabel(holdingsSnapshot.latestPriceAsOf)}
          </p>
          <p className="metric-label">Latest cache</p>
        </article>
      </section>

      <HoldingsTable holdings={holdingsSnapshot.holdings} canRefresh={isAdmin} />

      <SummaryCards summary={summary} />
    </section>
  );
}
