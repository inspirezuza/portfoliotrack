import "server-only";

import { cookies } from "next/headers";
import { ALL_PORTFOLIOS_SELECTION_KEY, parsePortfolioRouteKey } from "@/lib/portfolio/paths";
import {
  ensureDefaultPortfolio,
  getPortfolioById,
  listPortfolios,
  type PortfolioListItem,
} from "@/server/portfolios";

export const PORTFOLIO_COOKIE_KEY = "portfoliotrack.portfolioId";

export type SinglePortfolioSelection = PortfolioListItem & {
  kind: "single";
  key: string;
};

export type AllPortfoliosSelection = {
  kind: "all";
  key: typeof ALL_PORTFOLIOS_SELECTION_KEY;
  id: null;
  name: "All portfolios";
  isDefault: false;
  createdAt: null;
  updatedAt: null;
};

export type SelectedPortfolio = SinglePortfolioSelection | AllPortfoliosSelection;

export type PortfolioSelection = {
  portfolios: PortfolioListItem[];
  selectedPortfolio: SelectedPortfolio;
};

export class AggregatePortfolioSelectionError extends Error {
  readonly code = "AGGREGATE_PORTFOLIO_SELECTION";

  constructor() {
    super("Choose a specific portfolio before making this change.");
    this.name = "AggregatePortfolioSelectionError";
  }
}

function toSinglePortfolioSelection(portfolio: PortfolioListItem): SinglePortfolioSelection {
  return {
    ...portfolio,
    kind: "single",
    key: String(portfolio.id),
  };
}

export function getAllPortfoliosSelection(): AllPortfoliosSelection {
  return {
    kind: "all",
    key: ALL_PORTFOLIOS_SELECTION_KEY,
    id: null,
    name: "All portfolios",
    isDefault: false,
    createdAt: null,
    updatedAt: null,
  };
}

export function isAllPortfoliosSelection(
  selectedPortfolio: SelectedPortfolio,
): selectedPortfolio is AllPortfoliosSelection {
  return selectedPortfolio.kind === "all";
}

export async function getSelectedPortfolioId() {
  const selection = await getPortfolioSelection();

  if (isAllPortfoliosSelection(selection.selectedPortfolio)) {
    throw new AggregatePortfolioSelectionError();
  }

  return selection.selectedPortfolio.id;
}

export async function getRememberedPortfolioKey() {
  const cookieStore = await cookies();
  return parsePortfolioRouteKey(cookieStore.get(PORTFOLIO_COOKIE_KEY)?.value);
}

export async function getPortfolioSelection({
  portfolioKey,
}: {
  portfolioKey?: string | null;
} = {}): Promise<PortfolioSelection> {
  await ensureDefaultPortfolio();

  const routePortfolioKey = parsePortfolioRouteKey(portfolioKey);
  const selectedPortfolioKey =
    portfolioKey == null ? await getRememberedPortfolioKey() : routePortfolioKey;
  const portfolios = await listPortfolios();

  if (selectedPortfolioKey === ALL_PORTFOLIOS_SELECTION_KEY || selectedPortfolioKey == null) {
    return {
      portfolios,
      selectedPortfolio: getAllPortfoliosSelection(),
    };
  }

  const selectedByKey = await getPortfolioById(selectedPortfolioKey);

  if (selectedByKey == null) {
    return {
      portfolios,
      selectedPortfolio: getAllPortfoliosSelection(),
    };
  }

  return {
    portfolios,
    selectedPortfolio: toSinglePortfolioSelection(selectedByKey),
  };
}
