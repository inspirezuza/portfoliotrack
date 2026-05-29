import { NextResponse, type NextRequest } from "next/server";
import {
  PORTFOLIO_COOKIE_KEY,
  getPortfolioDashboardPath,
  getPortfolioKeyFromPathname,
  parsePortfolioRouteKey,
} from "@/lib/portfolio/paths";

const PORTFOLIO_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Collapses the cold first-load redirect chain that previously bounced through
 * `/api/portfolio-selection` just to persist the selected-portfolio cookie:
 *
 * - On `/`, a returning visitor with a remembered selection is redirected
 *   straight to their dashboard at the edge, skipping a Server Component render
 *   (and its DB round-trips) entirely.
 * - On `/portfolio/{key}` routes, the remembered-selection cookie is written on
 *   the same response that renders the page, so the page no longer has to issue
 *   a separate redirect to record the selection.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookieKey = parsePortfolioRouteKey(request.cookies.get(PORTFOLIO_COOKIE_KEY)?.value);

  if (pathname === "/") {
    if (cookieKey == null) {
      return NextResponse.next();
    }

    return NextResponse.redirect(new URL(getPortfolioDashboardPath(cookieKey), request.url));
  }

  const routeKey = getPortfolioKeyFromPathname(pathname);

  if (routeKey == null || routeKey === cookieKey) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set(PORTFOLIO_COOKIE_KEY, routeKey, {
    path: "/",
    maxAge: PORTFOLIO_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  return response;
}

export const config = {
  matcher: ["/", "/portfolio/:path*"],
};
