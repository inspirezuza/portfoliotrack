import { NextResponse } from "next/server";
import { ensureDefaultPortfolio, listPortfolios } from "@/server/portfolios";
import { runDailyAutoMarketRefresh, type DailyAutoRefreshResponse } from "@/server/market-refresh";

export const dynamic = "force-dynamic";

type PortfolioRefreshResult = {
  portfolioId: number;
  portfolioName: string;
  result: DailyAutoRefreshResponse;
};

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

function getCronSecret() {
  const secret = process.env.CRON_SECRET?.trim();

  return secret === "" ? undefined : secret;
}

function isAuthorizedCronRequest(request: Request, secret: string) {
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function getAggregateStatus(results: PortfolioRefreshResult[]) {
  if (results.some(({ result }) => result.status === "failed")) {
    return "failed";
  }

  if (results.some(({ result }) => result.status === "success")) {
    return "success";
  }

  return "skipped";
}

export async function GET(request: Request) {
  const secret = getCronSecret();

  if (secret == null) {
    return jsonErrorResponse("CRON_SECRET_MISSING", "CRON_SECRET is not configured.", 500);
  }

  if (!isAuthorizedCronRequest(request, secret)) {
    return jsonErrorResponse("UNAUTHORIZED", "Cron authorization failed.", 401);
  }

  try {
    await ensureDefaultPortfolio();
    const portfolios = await listPortfolios();
    const results: PortfolioRefreshResult[] = [];

    for (const portfolio of portfolios) {
      const result = await runDailyAutoMarketRefresh({ portfolioId: portfolio.id });

      results.push({
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        result
      });
    }

    return NextResponse.json({
      status: getAggregateStatus(results),
      refreshedAt: new Date().toISOString(),
      timeZone: "Asia/Bangkok",
      portfolios: results
    });
  } catch (error) {
    console.error("Scheduled market data refresh failed", error);
    return jsonErrorResponse("INTERNAL_ERROR", "Scheduled market data refresh failed.", 500);
  }
}
