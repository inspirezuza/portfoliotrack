import { handleMarketDataCronRequest } from "@/app/api/cron/market-data/handler";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleMarketDataCronRequest(request, "2100");
}
