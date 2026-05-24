import { NextResponse } from "next/server";
import { PORTFOLIO_COOKIE_KEY } from "@/lib/portfolio/selection";
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

function setPortfolioCookie(response: NextResponse, portfolioId: number) {
  response.cookies.set(PORTFOLIO_COOKIE_KEY, String(portfolioId), {
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

    const portfolioId = parsePortfolioId((payload as Record<string, unknown>).portfolioId);
    const portfolio = await getPortfolioById(portfolioId);

    if (portfolio == null) {
      throw new PortfolioServiceError("PORTFOLIO_NOT_FOUND", `Portfolio ${portfolioId} does not exist.`);
    }

    const response = NextResponse.json({ portfolio });
    setPortfolioCookie(response, portfolio.id);

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
