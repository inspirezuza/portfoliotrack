import { HoldingsTable } from "@/components/holdings-table";
import { SummaryCards } from "@/components/summary-cards";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getUiCopy } from "@/lib/ui/copy";
import { getServerUiLanguage } from "@/lib/ui/server";
import { getUiLocale } from "@/lib/ui/translations";
import { getDashboardSnapshot } from "@/server/dashboard";

export const dynamic = "force-dynamic";

function formatCacheDateLabel(value: string | null, locale: string, emptyLabel: string) {
  if (value == null) {
    return emptyLabel;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Bangkok",
    year: "numeric"
  }).format(date);
}

export default async function HoldingsPage() {
  const language = await getServerUiLanguage();
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);
  const isAdmin = await isAdminAuthenticated();
  const { summary, holdingsSnapshot } = await getDashboardSnapshot({
    ensureFresh: isAdmin
  });

  return (
    <section className="workstation-page">
      <div className="workstation-topbar">
        <div>
          <p className="eyebrow">{copy.holdings.pageEyebrow}</p>
          <h1>{copy.holdings.pageTitle}</h1>
        </div>
      </div>

      <section className="asset-performance-grid" aria-label={copy.holdings.statusLabel}>
        <article className="metric-card">
          <p className="metric-value">{holdingsSnapshot.openPositionCount}</p>
          <p className="metric-label">{copy.holdings.open}</p>
        </article>
        <article className="metric-card">
          <p className="metric-value">{holdingsSnapshot.pricedPositionCount}</p>
          <p className="metric-label">{copy.holdings.priced}</p>
        </article>
        <article className="metric-card">
          <p className="metric-value">{holdingsSnapshot.missingPricePositionCount}</p>
          <p className="metric-label">{copy.holdings.missing}</p>
        </article>
        <article className="metric-card">
          <p className="metric-value metric-value-compact">
            {formatCacheDateLabel(holdingsSnapshot.latestPriceAsOf, locale, copy.shared.noCache)}
          </p>
          <p className="metric-label">{copy.holdings.latestCache}</p>
        </article>
      </section>

      <HoldingsTable
        holdings={holdingsSnapshot.holdings}
        language={language}
        canRefresh={isAdmin}
      />

      <SummaryCards language={language} summary={summary} />
    </section>
  );
}
