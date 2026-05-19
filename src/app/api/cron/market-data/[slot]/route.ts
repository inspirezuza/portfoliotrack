import { handleMarketDataCronRequest } from "@/app/api/cron/market-data/handler";

export const dynamic = "force-dynamic";

type MarketDataCronSlotRouteContext = {
  params: Promise<{
    slot: string;
  }>;
};

export async function GET(request: Request, context: MarketDataCronSlotRouteContext) {
  const { slot } = await context.params;

  return handleMarketDataCronRequest(request, slot);
}
