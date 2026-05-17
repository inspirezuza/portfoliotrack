import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { PORTFOLIO_COOKIE_KEY } from "@/lib/portfolio/selection";
import {
  createPortfolio,
  deletePortfolio,
  listPortfolios,
  PortfolioServiceError,
  updatePortfolio
} from "@/server/portfolios";

function getStatusCode(error: PortfolioServiceError) {
  switch (error.code) {
    case "VALIDATION_ERROR":
    case "CONFIRMATION_REQUIRED":
      return 400;
    case "DUPLICATE_PORTFOLIO":
    case "LAST_PORTFOLIO":
      return 409;
    case "PORTFOLIO_NOT_FOUND":
      return 404;
    default:
      return 500;
  }
}

function jsonErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown> | null
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details: details ?? null
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

async function assertAdmin() {
  if (!(await isAdminAuthenticated())) {
    return jsonErrorResponse("ADMIN_REQUIRED", "Admin login is required to manage portfolios.", 401);
  }

  return null;
}

export async function GET() {
  const portfolios = await listPortfolios();

  return NextResponse.json({ portfolios });
}

export async function POST(request: Request) {
  try {
    const adminError = await assertAdmin();

    if (adminError) {
      return adminError;
    }

    const payload = await request.json();
    const portfolio = await createPortfolio(payload);
    const response = NextResponse.json({ portfolio }, { status: 201 });
    setPortfolioCookie(response, portfolio.id);

    return response;
  } catch (error) {
    if (error instanceof PortfolioServiceError) {
      return jsonErrorResponse(error.code, error.message, getStatusCode(error), error.details);
    }

    if (error instanceof SyntaxError) {
      return jsonErrorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
    }

    console.error("Unexpected portfolio create failure", error);

    return jsonErrorResponse("INTERNAL_ERROR", "Portfolio could not be created.", 500);
  }
}

export async function PUT(request: Request) {
  try {
    const adminError = await assertAdmin();

    if (adminError) {
      return adminError;
    }

    const payload = await request.json();
    const portfolio = await updatePortfolio(payload);

    return NextResponse.json({ portfolio });
  } catch (error) {
    if (error instanceof PortfolioServiceError) {
      return jsonErrorResponse(error.code, error.message, getStatusCode(error), error.details);
    }

    if (error instanceof SyntaxError) {
      return jsonErrorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
    }

    console.error("Unexpected portfolio update failure", error);

    return jsonErrorResponse("INTERNAL_ERROR", "Portfolio could not be updated.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const adminError = await assertAdmin();

    if (adminError) {
      return adminError;
    }

    const payload = await request.json();
    const result = await deletePortfolio(payload);
    const response = NextResponse.json(result);
    setPortfolioCookie(response, result.selectedPortfolio.id);

    return response;
  } catch (error) {
    if (error instanceof PortfolioServiceError) {
      return jsonErrorResponse(error.code, error.message, getStatusCode(error), error.details);
    }

    if (error instanceof SyntaxError) {
      return jsonErrorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
    }

    console.error("Unexpected portfolio delete failure", error);

    return jsonErrorResponse("INTERNAL_ERROR", "Portfolio could not be deleted.", 500);
  }
}
