import { loadEnvConfig } from "@next/env";
import { eq, inArray, sql } from "drizzle-orm";
import { refreshMarketDataCache } from "../market/provider-core";
import { createDatabaseHandle } from "./client";
import {
  appSettings,
  historicalPrices,
  intradayPrices,
  instruments,
  portfolios,
  priceSnapshots,
  transactions,
  type NewInstrument,
  type NewTransaction
} from "./schema";

loadEnvConfig(process.cwd());

const defaultLocalDatabaseUrl = "postgresql://postgres@localhost:5432/portfoliotrack";

function getSeedDatabaseUrl() {
  const localDatabaseUrl = process.env.LOCAL_DATABASE_URL;
  const hostedDatabaseUrl = process.env.DATABASE_URL;

  return process.env.NODE_ENV === "production"
    ? hostedDatabaseUrl || localDatabaseUrl || ""
    : localDatabaseUrl || hostedDatabaseUrl || defaultLocalDatabaseUrl;
}

function isLocalDatabaseUrl(databaseUrl: string) {
  try {
    const hostname = new URL(databaseUrl).hostname;

    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function assertSafeSeedTarget() {
  const databaseUrl = getSeedDatabaseUrl();

  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run local seed against production NODE_ENV.");
  }

  if (!databaseUrl || !isLocalDatabaseUrl(databaseUrl)) {
    throw new Error("Refusing to run local seed against a non-local database URL.");
  }
}

const defaultInstruments: NewInstrument[] = [
  {
    symbol: "AAPL",
    displayName: "Apple Inc.",
    market: "US",
    instrumentType: "STOCK",
    currency: "USD",
    providerSymbol: "AAPL",
    underlyingSymbol: null,
    underlyingDisplayName: null,
    underlyingCurrency: null,
    underlyingProviderSymbol: null,
    drRatio: null,
    fxProviderSymbol: null,
    isActive: true
  },
  {
    symbol: "SPYM",
    displayName: "State Street SPDR Portfolio S&P 500 ETF",
    market: "US",
    instrumentType: "ETF",
    currency: "USD",
    providerSymbol: "SPYM",
    underlyingSymbol: null,
    underlyingDisplayName: null,
    underlyingCurrency: null,
    underlyingProviderSymbol: null,
    drRatio: null,
    fxProviderSymbol: null,
    isActive: true
  },
  {
    symbol: "USDTHB",
    displayName: "US Dollar to Thai Baht",
    market: "FX",
    instrumentType: "FX",
    currency: "THB",
    providerSymbol: "USDTHB=X",
    underlyingSymbol: "USD",
    underlyingDisplayName: "US Dollar",
    underlyingCurrency: "USD",
    underlyingProviderSymbol: null,
    drRatio: null,
    fxProviderSymbol: null,
    isActive: false
  },
  {
    symbol: "AAPL80",
    displayName: "Apple DR",
    market: "TH",
    instrumentType: "DR",
    currency: "THB",
    providerSymbol: "AAPL80.BK",
    underlyingSymbol: "AAPL",
    underlyingDisplayName: "Apple Inc.",
    underlyingCurrency: "USD",
    underlyingProviderSymbol: "AAPL",
    drRatio: 1000,
    fxProviderSymbol: "USDTHB=X",
    isActive: true
  },
  {
    symbol: "CPALL",
    displayName: "CP ALL Public Company Limited",
    market: "TH",
    instrumentType: "STOCK",
    currency: "THB",
    providerSymbol: "CPALL.BK",
    underlyingSymbol: null,
    underlyingDisplayName: null,
    underlyingCurrency: null,
    underlyingProviderSymbol: null,
    drRatio: null,
    fxProviderSymbol: null,
    isActive: true
  },
  {
    symbol: "BDMS",
    displayName: "Bangkok Dusit Medical Services",
    market: "TH",
    instrumentType: "STOCK",
    currency: "THB",
    providerSymbol: "BDMS.BK",
    underlyingSymbol: null,
    underlyingDisplayName: null,
    underlyingCurrency: null,
    underlyingProviderSymbol: null,
    drRatio: null,
    fxProviderSymbol: null,
    isActive: true
  }
];

const defaultSettings: Array<{ key: string; value: string }> = [
  { key: "baseCurrency", value: "THB" },
  { key: "benchmarkSymbol", value: "SPYM" },
  { key: "marketRefreshMinutes", value: "30" },
  { key: "timezone", value: "Asia/Bangkok" },
  { key: "symbolOverrides", value: "{}" }
];

const seededPortfolioNames = ["Main Portfolio", "US Stocks Demo", "Closed Trades Demo"];

const seededTransactionNotes = [
  "Local seed: AAPL80 initial buy",
  "Local seed: CPALL initial buy",
  "Local seed: BDMS initial buy",
  "Local seed: AAPL80 add",
  "Local seed: CPALL add",
  "Local seed: AAPL80 partial sell",
  "Local seed: mixed AAPL buy",
  "Local seed: mixed AAPL80 buy",
  "Local seed: closed BDMS buy",
  "Local seed: closed BDMS sell"
];
const retiredSeededTransactionNotes = ["Local seed: mixed SPY buy"];
const localSeedPriceSource = "local-seed";

function buildMainPortfolioTransactions({
  aapl80Id,
  bdmsId,
  cpallId,
  portfolioId
}: {
  aapl80Id: number;
  bdmsId: number;
  cpallId: number;
  portfolioId: number;
}): NewTransaction[] {
  return [
    {
      portfolioId,
      instrumentId: aapl80Id,
      tradeDate: "2025-01-06",
      side: "BUY",
      broker: "DIME",
      quantity: 100,
      price: 7.8,
      fee: 5,
      notes: "Local seed: AAPL80 initial buy"
    },
    {
      portfolioId,
      instrumentId: cpallId,
      tradeDate: "2025-02-10",
      side: "BUY",
      broker: "DIME",
      quantity: 200,
      price: 44.5,
      fee: 10,
      notes: "Local seed: CPALL initial buy"
    },
    {
      portfolioId,
      instrumentId: bdmsId,
      tradeDate: "2025-03-17",
      side: "BUY",
      broker: "DIME",
      quantity: 300,
      price: 17.8,
      fee: 8,
      notes: "Local seed: BDMS initial buy"
    },
    {
      portfolioId,
      instrumentId: aapl80Id,
      tradeDate: "2025-08-18",
      side: "BUY",
      broker: "WEBULL",
      quantity: 50,
      price: 8.15,
      fee: 3,
      notes: "Local seed: AAPL80 add"
    },
    {
      portfolioId,
      instrumentId: cpallId,
      tradeDate: "2026-02-12",
      side: "BUY",
      broker: "DIME",
      quantity: 100,
      price: 45.75,
      fee: 8,
      notes: "Local seed: CPALL add"
    },
    {
      portfolioId,
      instrumentId: aapl80Id,
      tradeDate: "2026-05-16",
      side: "SELL",
      broker: "WEBULL",
      quantity: 30,
      price: 9.65,
      fee: 4,
      notes: "Local seed: AAPL80 partial sell"
    }
  ];
}

function buildMixedCurrencyTransactions({
  aaplId,
  aapl80Id,
  portfolioId
}: {
  aaplId: number;
  aapl80Id: number;
  portfolioId: number;
}): NewTransaction[] {
  return [
    {
      portfolioId,
      instrumentId: aaplId,
      tradeDate: "2025-01-06",
      side: "BUY",
      broker: "WEBULL",
      quantity: 10,
      price: 181.2,
      fee: 1.5,
      notes: "Local seed: mixed AAPL buy"
    },
    {
      portfolioId,
      instrumentId: aapl80Id,
      tradeDate: "2025-06-16",
      side: "BUY",
      broker: "DIME",
      quantity: 80,
      price: 8.15,
      fee: 5,
      notes: "Local seed: mixed AAPL80 buy"
    }
  ];
}

function buildClosedTradesTransactions({
  bdmsId,
  portfolioId
}: {
  bdmsId: number;
  portfolioId: number;
}): NewTransaction[] {
  return [
    {
      portfolioId,
      instrumentId: bdmsId,
      tradeDate: "2025-03-17",
      side: "BUY",
      broker: "DIME",
      quantity: 150,
      price: 17.8,
      fee: 6,
      notes: "Local seed: closed BDMS buy"
    },
    {
      portfolioId,
      instrumentId: bdmsId,
      tradeDate: "2025-11-21",
      side: "SELL",
      broker: "DIME",
      quantity: 150,
      price: 18.25,
      fee: 6,
      notes: "Local seed: closed BDMS sell"
    }
  ];
}

assertSafeSeedTarget();

const { db } = createDatabaseHandle();

async function main() {
  const portfolioIdsToRefresh: number[] = [];

  await db.transaction(async (tx) => {
    await tx.insert(instruments)
      .values(defaultInstruments)
      .onConflictDoUpdate({
        target: instruments.symbol,
        set: {
          displayName: sql`excluded.display_name`,
          market: sql`excluded.market`,
          instrumentType: sql`excluded.instrument_type`,
          currency: sql`excluded.currency`,
          providerSymbol: sql`excluded.provider_symbol`,
          underlyingSymbol: sql`excluded.underlying_symbol`,
          underlyingDisplayName: sql`excluded.underlying_display_name`,
          underlyingCurrency: sql`excluded.underlying_currency`,
          underlyingProviderSymbol: sql`excluded.underlying_provider_symbol`,
          drRatio: sql`excluded.dr_ratio`,
          fxProviderSymbol: sql`excluded.fx_provider_symbol`,
          isActive: sql`excluded.is_active`,
          updatedAt: sql`CURRENT_TIMESTAMP`
        }
      });

    const existingPortfolios = await tx.select().from(portfolios);

    if (existingPortfolios.length === 0) {
      await tx.insert(portfolios)
        .values({
          name: "Main Portfolio",
          isDefault: true
        });
    }

    await tx.delete(portfolios).where(eq(portfolios.name, "Mixed Currency Demo"));

    for (const portfolioName of seededPortfolioNames) {
      await tx.insert(portfolios)
        .values({
          name: portfolioName,
          isDefault: false
        })
        .onConflictDoUpdate({
          target: portfolios.name,
          set: {
            updatedAt: sql`CURRENT_TIMESTAMP`
          }
        });
    }

    let portfolioRows = await tx.select().from(portfolios);

    if (!portfolioRows.some((portfolio) => portfolio.isDefault)) {
      await tx.update(portfolios)
        .set({ isDefault: true, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(portfolios.name, "Main Portfolio"));
      portfolioRows = await tx.select().from(portfolios);
    }

    const portfoliosByName = new Map(portfolioRows.map((portfolio) => [portfolio.name, portfolio]));
    const mainPortfolio = portfoliosByName.get("Main Portfolio");
    const mixedCurrencyPortfolio = portfoliosByName.get("US Stocks Demo");
    const closedTradesPortfolio = portfoliosByName.get("Closed Trades Demo");
    const instrumentRows = await tx.select().from(instruments);
    const instrumentsBySymbol = new Map(instrumentRows.map((instrument) => [instrument.symbol, instrument]));
    const aapl80 = instrumentsBySymbol.get("AAPL80");
    const aapl = instrumentsBySymbol.get("AAPL");
    const bdms = instrumentsBySymbol.get("BDMS");
    const cpall = instrumentsBySymbol.get("CPALL");
    const spym = instrumentsBySymbol.get("SPYM");

    if (!mainPortfolio || !mixedCurrencyPortfolio || !closedTradesPortfolio || !aapl || !aapl80 || !bdms || !cpall || !spym) {
      throw new Error("Seed data could not load demo portfolios and sample instruments.");
    }

    await tx.delete(transactions).where(
      inArray(transactions.notes, [...seededTransactionNotes, ...retiredSeededTransactionNotes])
    );
    await tx.insert(transactions).values([
      ...buildMainPortfolioTransactions({
        aapl80Id: aapl80.id,
        bdmsId: bdms.id,
        cpallId: cpall.id,
        portfolioId: mainPortfolio.id
      }),
      ...buildMixedCurrencyTransactions({
        aaplId: aapl.id,
        aapl80Id: aapl80.id,
        portfolioId: mixedCurrencyPortfolio.id
      }),
      ...buildClosedTradesTransactions({
        bdmsId: bdms.id,
        portfolioId: closedTradesPortfolio.id
      })
    ]);

    portfolioIdsToRefresh.push(mainPortfolio.id, mixedCurrencyPortfolio.id, closedTradesPortfolio.id);

    await tx.delete(historicalPrices).where(eq(historicalPrices.source, localSeedPriceSource));
    await tx.delete(intradayPrices).where(eq(intradayPrices.source, localSeedPriceSource));
    await tx.delete(priceSnapshots).where(eq(priceSnapshots.source, localSeedPriceSource));

    for (const setting of defaultSettings) {
      await tx.insert(appSettings)
        .values(setting)
        .onConflictDoUpdate({
          target: appSettings.key,
          set: {
            value: setting.value,
            updatedAt: sql`CURRENT_TIMESTAMP`
          }
      });
    }
  });

  const refreshResults = [];

  for (const portfolioId of portfolioIdsToRefresh) {
    refreshResults.push(await refreshMarketDataCache({ portfolioId }));
  }

  const quoteCount = refreshResults.reduce((count, result) => count + result.quoteRefreshCount, 0);
  const historicalBarCount = refreshResults.reduce((count, result) => count + result.historicalBarCount, 0);
  const intradayBarCount = refreshResults.reduce((count, result) => count + result.intradayBarCount, 0);
  const issueCount = refreshResults.reduce((count, result) => count + result.issues.length, 0);

  console.log(
    `Database seeded with ${defaultInstruments.length} instruments, ${seededTransactionNotes.length} transactions, and ${defaultSettings.length} settings. Real market refresh fetched ${quoteCount} quotes, ${historicalBarCount} historical bars, ${intradayBarCount} intraday bars, with ${issueCount} issues.`
  );
}

main().catch((error) => {
  console.error("Database seed failed.", error);
  process.exit(1);
});
