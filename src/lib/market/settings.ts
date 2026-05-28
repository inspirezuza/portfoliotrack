import { db } from "@/lib/db/runtime-core";
import { appSettings } from "@/lib/db/schema";
import {
  DEFAULT_BASE_CURRENCY,
  DEFAULT_BENCHMARK_SYMBOL,
  DEFAULT_MARKET_REFRESH_MINUTES,
} from "@/lib/market/benchmark-watchlist";

export type MarketSettings = {
  benchmarkSymbol: string | null;
  baseCurrency: string;
  marketRefreshMinutes: number;
};

type MarketSettingRow = {
  key: string;
  value: string;
};

function parseRefreshMinutes(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MARKET_REFRESH_MINUTES;
  }

  return parsed;
}

function normalizeBenchmarkSymbol(value: string) {
  const symbol = value.trim().toUpperCase();

  return symbol === "SPY" ? DEFAULT_BENCHMARK_SYMBOL : symbol;
}

export function buildMarketSettingsFromRows(settings: MarketSettingRow[]): MarketSettings {
  const settingsMap = new Map(settings.map((setting) => [setting.key, setting.value]));
  const benchmarkSymbol = normalizeBenchmarkSymbol(
    settingsMap.get("benchmarkSymbol") || DEFAULT_BENCHMARK_SYMBOL,
  );
  const baseCurrency =
    settingsMap.get("baseCurrency")?.trim().toUpperCase() || DEFAULT_BASE_CURRENCY;

  return {
    benchmarkSymbol,
    baseCurrency,
    marketRefreshMinutes: parseRefreshMinutes(settingsMap.get("marketRefreshMinutes")),
  };
}

export async function getMarketSettings(): Promise<MarketSettings> {
  const settings = await db.select().from(appSettings);

  return buildMarketSettingsFromRows(settings);
}
