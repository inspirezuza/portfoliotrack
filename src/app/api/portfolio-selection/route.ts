import { NextResponse } from "next/server";
import {
  ALL_PORTFOLIOS_SELECTION_KEY,
  getAllPortfoliosSelection,
  PORTFOLIO_COOKIE_KEY
} from "@/lib/portfolio/selection";
import { getPortfolioById, PortfolioServiceError, parsePortfolioId } from "@/server/portfolios";

function jsonErrorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      error: {
        code,
        message
      }
    },
    { status }
  );
}

function setPortfolioCookie(response: NextResponse, portfolioKey: string) {
  response.cookies.set(PORTFOLIO_COOKIE_KEY, portfolioKey, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax"
  });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      throw new PortfolioServiceError("VALIDATION_ERROR", "Portfolio selection payload must be an object.");
    }

    const portfolioKey = (payload as Record<string, unknown>).portfolioId;

    if (portfolioKey === ALL_PORTFOLIOS_SELECTION_KEY) {
      const response = NextResponse.json({ portfolio: getAllPortfoliosSelection() });
      setPortfolioCookie(response, ALL_PORTFOLIOS_SELECTION_KEY);

      return response;
    }

    const portfolioId = parsePortfolioId(portfolioKey);
    const portfolio = await getPortfolioById(portfolioId);

    if (portfolio == null) {
      throw new PortfolioServiceError("PORTFOLIO_NOT_FOUND", `Portfolio ${portfolioId} does not exist.`);
    }

    const response = NextResponse.json({ portfolio });
    setPortfolioCookie(response, String(portfolio.id));

    return response;
  } catch (error) {
    if (error instanceof PortfolioServiceError) {
      return jsonErrorResponse(
        error.code,
        error.message,
        error.code === "PORTFOLIO_NOT_FOUND" ? 404 : 400
      );
    }

    if (error instanceof SyntaxError) {
      return jsonErrorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
    }

    console.error("Unexpected portfolio selection failure", error);

    return jsonErrorResponse("INTERNAL_ERROR", "Portfolio selection failed.", 500);
  }
}
