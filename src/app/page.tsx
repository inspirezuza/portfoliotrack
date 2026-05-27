import { redirect } from "next/navigation";
import { getPortfolioDashboardPath } from "@/lib/portfolio/paths";
import { getPortfolioSelection } from "@/lib/portfolio/selection";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { selectedPortfolio } = await getPortfolioSelection();

  redirect(getPortfolioDashboardPath(selectedPortfolio.key));
}
