import "server-only";

import { cookies } from "next/headers";
import { ensureDefaultPortfolio, getPortfolioById, listPortfolios, type PortfolioListItem } from "@/server/portfolios";

export const PORTFOLIO_COOKIE_KEY = "portfoliotrack.portfolioId";

export type PortfolioSelection = {
  portfolios: PortfolioListItem[];
  selectedPortfolio: PortfolioListItem;
};

function parseCookiePortfolioId(value: string | undefined) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function getSelectedPortfolioId() {
  const selection = await getPortfolioSelection();

  return selection.selectedPortfolio.id;
}

export async function getPortfolioSelection(): Promise<PortfolioSelection> {
  const cookieStore = await cookies();
  const cookiePortfolioId = parseCookiePortfolioId(cookieStore.get(PORTFOLIO_COOKIE_KEY)?.value);
  const defaultPortfolio = await ensureDefaultPortfolio();
  const [portfolios, selectedByCookie] = await Promise.all([
    listPortfolios(),
    cookiePortfolioId == null ? Promise.resolve(null) : getPortfolioById(cookiePortfolioId)
  ]);
  const selectedPortfolio =
    selectedByCookie ??
    portfolios.find((portfolio) => portfolio.isDefault) ??
    defaultPortfolio;

  return {
    portfolios,
    selectedPortfolio
  };
}
