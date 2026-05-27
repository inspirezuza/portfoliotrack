import DashboardPage from "@/app/dashboard-page";

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
