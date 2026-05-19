import { NextResponse } from "next/server";
import { ensureDefaultPortfolio, listPortfolios } from "@/server/portfolios";
import { runDailyAutoMarketRefresh, type DailyAutoRefreshResponse } from "@/server/market-refresh";

export const MARKET_REFRESH_CRON_SLOTS = new Map([
  ["1800", "18:00"],
  ["1900", "19:00"],
  ["2000", "20:00"],
  ["2030", "20:30"],
  ["2100", "21:00"],
  ["2200", "22:00"],
  ["2300", "23:00"],
  ["0000", "00:00"],
  ["0300", "03:00"]
]);

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

function getValidatedSlot(slot: string) {
  return MARKET_REFRESH_CRON_SLOTS.has(slot) ? slot : null;
}

export async function handleMarketDataCronRequest(request: Request, slotInput: string) {
  const slot = getValidatedSlot(slotInput);

  if (slot == null) {
    return jsonErrorResponse("INVALID_CRON_SLOT", "Market data cron slot is not supported.", 404);
  }

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
      const result = await runDailyAutoMarketRefresh({ portfolioId: portfolio.id, refreshSlot: slot });

      results.push({
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        result
      });
    }

    return NextResponse.json({
      status: getAggregateStatus(results),
      refreshedAt: new Date().toISOString(),
      refreshSlot: slot,
      scheduledTimeThailand: MARKET_REFRESH_CRON_SLOTS.get(slot),
      timeZone: "Asia/Bangkok",
      portfolios: results
    });
  } catch (error) {
    console.error("Scheduled market data refresh failed", error);
    return jsonErrorResponse("INTERNAL_ERROR", "Scheduled market data refresh failed.", 500);
  }
}
