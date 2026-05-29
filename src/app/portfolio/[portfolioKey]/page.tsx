import DashboardPage from "@/app/dashboard-page";

// Route-segment config only takes effect in the route module itself (not in the
// imported DashboardPage). Forcing dynamic rendering disables the prerender pass
// so the page's Suspense boundaries stream as normal pending boundaries instead
// of being postponed.
export const dynamic = "force-dynamic";

type PortfolioDashboardRouteProps = {
  params: Promise<{
    portfolioKey: string;
  }>;
  searchParams?: Promise<{
    refresh?: string;
    eventAt?: string;
    refreshedAt?: string;
    quoteCount?: string;
    issueCount?: string;
    message?: string;
    runId?: string;
  }>;
};

export default async function PortfolioDashboardRoute({
  params,
  searchParams,
}: PortfolioDashboardRouteProps) {
  const { portfolioKey } = await params;

  return <DashboardPage portfolioKey={portfolioKey} searchParams={searchParams} />;
}
