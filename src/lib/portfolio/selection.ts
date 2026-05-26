import "server-only";

import { cookies } from "next/headers";
import { ensureDefaultPortfolio, getPortfolioById, listPortfolios, type PortfolioListItem } from "@/server/portfolios";

export const PORTFOLIO_COOKIE_KEY = "portfoliotrack.portfolioId";
export const ALL_PORTFOLIOS_SELECTION_KEY = "all";

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

function parseCookiePortfolioId(value: string | undefined) {
  if (value === ALL_PORTFOLIOS_SELECTION_KEY) {
    return ALL_PORTFOLIOS_SELECTION_KEY;
  }

  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

function toSinglePortfolioSelection(portfolio: PortfolioListItem): SinglePortfolioSelection {
  return {
    ...portfolio,
    kind: "single",
    key: String(portfolio.id)
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
    updatedAt: null
  };
}

export function isAllPortfoliosSelection(
  selectedPortfolio: SelectedPortfolio
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

export async function getPortfolioSelection(): Promise<PortfolioSelection> {
  const cookieStore = await cookies();
  const cookiePortfolioId = parseCookiePortfolioId(cookieStore.get(PORTFOLIO_COOKIE_KEY)?.value);
  const defaultPortfolio = await ensureDefaultPortfolio();

  if (cookiePortfolioId === ALL_PORTFOLIOS_SELECTION_KEY) {
    return {
      portfolios: await listPortfolios(),
      selectedPortfolio: getAllPortfoliosSelection()
    };
  }

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
    selectedPortfolio: toSinglePortfolioSelection(selectedPortfolio)
  };
}
