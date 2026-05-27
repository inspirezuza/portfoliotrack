import TransactionsPage from "@/app/transactions-page";

type PortfolioTransactionsRouteProps = {
  params: Promise<{
    portfolioKey: string;
  }>;
  searchParams?: Promise<{
    edit?: string | string[];
  }>;
};

export default async function PortfolioTransactionsRoute({
  params,
  searchParams,
}: PortfolioTransactionsRouteProps) {
  const { portfolioKey } = await params;

  return <TransactionsPage portfolioKey={portfolioKey} searchParams={searchParams} />;
}
