import { notFound } from "next/navigation";
import { AssetHeader } from "@/components/asset-header";
import { DeferredAssetPriceChart } from "@/components/asset-deferred-widgets";
import { AssetDrComparisonCard } from "@/components/asset-detail/dr-comparison-card";
import { AssetDetailSidebar } from "@/components/asset-detail/sidebar";
import { AssetPerformanceMetrics } from "@/components/asset-detail/performance-metrics";
import { AssetTransactionHistory } from "@/components/asset-detail/transaction-history";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getPortfolioSelection, isAllPortfoliosSelection } from "@/lib/portfolio/selection";
import { getAssetDetail } from "@/server/assets";

export const dynamic = "force-dynamic";

type AssetDetailPageProps = {
  params: Promise<{
    symbol: string;
  }>;
};

export default async function AssetDetailPage({ params }: AssetDetailPageProps) {
  const isAdmin = await isAdminAuthenticated();
  const { portfolios, selectedPortfolio } = await getPortfolioSelection();
  const isAggregatePortfolio = isAllPortfoliosSelection(selectedPortfolio);
  const { symbol } = await params;
  const asset = await getAssetDetail(symbol, {
    ...(isAggregatePortfolio
      ? { portfolioIds: portfolios.map((portfolio) => portfolio.id) }
      : { portfolioId: selectedPortfolio.id }),
    allowMarketRefresh: isAdmin && !isAggregatePortfolio,
  });

  if (asset == null) {
    notFound();
  }

  return (
    <section className="dashboard-grid asset-detail-page">
      <AssetHeader asset={asset} />

      <AssetPerformanceMetrics asset={asset} />

      <AssetDrComparisonCard asset={asset} />

      <div className="asset-layout">
        <DeferredAssetPriceChart asset={asset} />

        <AssetDetailSidebar asset={asset} />
      </div>

      <AssetTransactionHistory asset={asset} />
    </section>
  );
}
