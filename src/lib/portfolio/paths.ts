export const ALL_PORTFOLIOS_SELECTION_KEY = "all";

export function parsePortfolioRouteKey(value: string | null | undefined) {
  if (value === ALL_PORTFOLIOS_SELECTION_KEY) {
    return ALL_PORTFOLIOS_SELECTION_KEY;
  }

  if (value == null) {
    return null;
  }

  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? String(id) : null;
}

export function getPortfolioDashboardPath(portfolioKey: string) {
  return `/portfolio/${portfolioKey}`;
}

export function getPortfolioTransactionsPath(portfolioKey: string) {
  return `/portfolio/${portfolioKey}/transactions`;
}

export function getPortfolioSelectionMemoryPath(portfolioKey: string, nextPath: string) {
  const searchParams = new URLSearchParams({
    next: nextPath,
    portfolioId: portfolioKey,
  });

  return `/api/portfolio-selection?${searchParams.toString()}`;
}

export function getPortfolioKeyFromPathname(pathname: string) {
  const [, segment, portfolioKey] = pathname.split("/");

  if (segment !== "portfolio") {
    return null;
  }

  return parsePortfolioRouteKey(portfolioKey);
}

export function isPortfolioTransactionsPath(pathname: string) {
  const [, segment, portfolioKey, subpath] = pathname.split("/");

  return (
    segment === "portfolio" &&
    parsePortfolioRouteKey(portfolioKey) != null &&
    subpath === "transactions"
  );
}
