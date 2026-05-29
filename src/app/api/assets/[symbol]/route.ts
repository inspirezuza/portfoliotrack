import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getPortfolioSelection, isAllPortfoliosSelection } from "@/lib/portfolio/selection";
import { getAssetDetail } from "@/server/assets";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { symbol } = await params;
    const isAdmin = await isAdminAuthenticated();
    const { portfolios, selectedPortfolio } = await getPortfolioSelection();
    const isAggregatePortfolio = isAllPortfoliosSelection(selectedPortfolio);

    const asset = await getAssetDetail(symbol, {
      ...(isAggregatePortfolio
        ? { portfolioIds: portfolios.map((portfolio) => portfolio.id) }
        : { portfolioId: selectedPortfolio.id }),
      allowMarketRefresh: isAdmin && !isAggregatePortfolio,
    });

    if (asset == null) {
      return NextResponse.json(
        { error: { code: "ASSET_NOT_FOUND", message: "Asset not found." } },
        { status: 404 },
      );
    }

    return NextResponse.json({ asset });
  } catch (error) {
    console.error("Unexpected asset detail API failure", error);

    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Asset details could not be loaded." } },
      { status: 500 },
    );
  }
}
