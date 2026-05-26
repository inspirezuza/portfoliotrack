import { loadEnvConfig } from "@next/env";
import { eq, inArray, sql } from "drizzle-orm";
import { createDatabaseHandle } from "./client";
import {
  appSettings,
  historicalPrices,
  intradayPrices,
  instruments,
  marketRefreshRuns,
  portfolios,
  priceSnapshots,
  transactions,
  type NewInstrument,
  type NewTransaction
} from "./schema";

loadEnvConfig(process.cwd());

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

const samplePriceHistory: Record<string, Array<{ priceDate: string; close: number; currency: string }>> = {
  AAPL80: [
    { priceDate: "2025-01-06", close: 18.4, currency: "THB" },
    { priceDate: "2025-06-16", close: 22.6, currency: "THB" },
    { priceDate: "2025-12-15", close: 25.8, currency: "THB" },
    { priceDate: "2026-05-01", close: 27.4, currency: "THB" },
    { priceDate: "2026-05-06", close: 28.2, currency: "THB" },
    { priceDate: "2026-05-10", close: 31.4, currency: "THB" },
    { priceDate: "2026-05-15", close: 33.8, currency: "THB" },
    { priceDate: "2026-05-20", close: 34.9, currency: "THB" }
  ],
  AAPL: [
    { priceDate: "2025-01-06", close: 181.2, currency: "USD" },
    { priceDate: "2025-06-16", close: 196.8, currency: "USD" },
    { priceDate: "2025-12-15", close: 204.1, currency: "USD" },
    { priceDate: "2026-05-01", close: 201.2, currency: "USD" },
    { priceDate: "2026-05-06", close: 204.8, currency: "USD" },
    { priceDate: "2026-05-10", close: 207.4, currency: "USD" },
    { priceDate: "2026-05-15", close: 211.9, currency: "USD" },
    { priceDate: "2026-05-20", close: 214.6, currency: "USD" }
  ],
  CPALL: [
    { priceDate: "2025-02-10", close: 52.5, currency: "THB" },
    { priceDate: "2025-08-18", close: 55.75, currency: "THB" },
    { priceDate: "2026-02-12", close: 54.25, currency: "THB" },
    { priceDate: "2026-05-01", close: 58.5, currency: "THB" },
    { priceDate: "2026-05-06", close: 57.25, currency: "THB" },
    { priceDate: "2026-05-10", close: 59.75, currency: "THB" },
    { priceDate: "2026-05-15", close: 60.5, currency: "THB" },
    { priceDate: "2026-05-20", close: 61.5, currency: "THB" }
  ],
  BDMS: [
    { priceDate: "2025-03-17", close: 24.75, currency: "THB" },
    { priceDate: "2025-09-22", close: 26.1, currency: "THB" },
    { priceDate: "2026-01-19", close: 26.9, currency: "THB" },
    { priceDate: "2026-05-01", close: 27.5, currency: "THB" },
    { priceDate: "2026-05-06", close: 28.1, currency: "THB" },
    { priceDate: "2026-05-10", close: 27.9, currency: "THB" },
    { priceDate: "2026-05-15", close: 28.75, currency: "THB" },
    { priceDate: "2026-05-20", close: 29.25, currency: "THB" }
  ],
  SPYM: [
    { priceDate: "2025-01-06", close: 70.15, currency: "USD" },
    { priceDate: "2025-06-16", close: 76.4, currency: "USD" },
    { priceDate: "2025-12-15", close: 82.9, currency: "USD" },
    { priceDate: "2026-05-01", close: 84.35, currency: "USD" },
    { priceDate: "2026-05-06", close: 85.1, currency: "USD" },
    { priceDate: "2026-05-10", close: 85.72, currency: "USD" },
    { priceDate: "2026-05-15", close: 86.43, currency: "USD" },
    { priceDate: "2026-05-20", close: 86.96, currency: "USD" }
  ],
  USDTHB: [
    { priceDate: "2025-01-06", close: 34.55, currency: "THB" },
    { priceDate: "2025-06-16", close: 35.1, currency: "THB" },
    { priceDate: "2025-12-15", close: 35.85, currency: "THB" },
    { priceDate: "2026-05-01", close: 36.6, currency: "THB" },
    { priceDate: "2026-05-06", close: 36.4, currency: "THB" },
    { priceDate: "2026-05-10", close: 36.25, currency: "THB" },
    { priceDate: "2026-05-15", close: 36.15, currency: "THB" },
    { priceDate: "2026-05-20", close: 36.1, currency: "THB" }
  ]
};

const sampleIntradayPrices: Record<string, Array<{ observedAt: string; close: number; currency: string; interval: "1h" }>> = {
  AAPL80: [
    { observedAt: "2026-05-20T10:00:00.000Z", close: 34.3, currency: "THB", interval: "1h" },
    { observedAt: "2026-05-20T11:00:00.000Z", close: 34.7, currency: "THB", interval: "1h" },
    { observedAt: "2026-05-20T12:00:00.000Z", close: 34.9, currency: "THB", interval: "1h" }
  ],
  AAPL: [
    { observedAt: "2026-05-20T14:00:00.000Z", close: 213.4, currency: "USD", interval: "1h" },
    { observedAt: "2026-05-20T15:00:00.000Z", close: 214.1, currency: "USD", interval: "1h" },
    { observedAt: "2026-05-20T16:00:00.000Z", close: 214.6, currency: "USD", interval: "1h" }
  ],
  CPALL: [
    { observedAt: "2026-05-20T10:00:00.000Z", close: 60.75, currency: "THB", interval: "1h" },
    { observedAt: "2026-05-20T11:00:00.000Z", close: 61.1, currency: "THB", interval: "1h" },
    { observedAt: "2026-05-20T12:00:00.000Z", close: 61.5, currency: "THB", interval: "1h" }
  ],
  BDMS: [
    { observedAt: "2026-05-20T10:00:00.000Z", close: 28.9, currency: "THB", interval: "1h" },
    { observedAt: "2026-05-20T11:00:00.000Z", close: 29.05, currency: "THB", interval: "1h" },
    { observedAt: "2026-05-20T12:00:00.000Z", close: 29.25, currency: "THB", interval: "1h" }
  ],
  SPYM: [
    { observedAt: "2026-05-20T14:00:00.000Z", close: 86.72, currency: "USD", interval: "1h" },
    { observedAt: "2026-05-20T15:00:00.000Z", close: 86.84, currency: "USD", interval: "1h" },
    { observedAt: "2026-05-20T16:00:00.000Z", close: 86.96, currency: "USD", interval: "1h" }
  ],
  USDTHB: [
    { observedAt: "2026-05-20T14:00:00.000Z", close: 36.12, currency: "THB", interval: "1h" },
    { observedAt: "2026-05-20T15:00:00.000Z", close: 36.08, currency: "THB", interval: "1h" },
    { observedAt: "2026-05-20T16:00:00.000Z", close: 36.1, currency: "THB", interval: "1h" }
  ]
};

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
      price: 18.4,
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
      price: 52.5,
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
      price: 24.75,
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
      price: 22.6,
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
      price: 54.25,
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
      price: 33,
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
      price: 22.6,
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
      price: 24.75,
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
      price: 26.8,
      fee: 6,
      notes: "Local seed: closed BDMS sell"
    }
  ];
}

const { db } = createDatabaseHandle();

async function main() {
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

    for (const [symbol, historyRows] of Object.entries(samplePriceHistory)) {
      const instrument = instrumentsBySymbol.get(symbol);

      if (!instrument) {
        continue;
      }

      await tx.insert(historicalPrices)
        .values(historyRows.map((row) => ({
          instrumentId: instrument.id,
          priceDate: row.priceDate,
          close: row.close,
          currency: row.currency,
          source: "local-seed"
        })))
        .onConflictDoUpdate({
          target: [historicalPrices.instrumentId, historicalPrices.priceDate],
          set: {
            close: sql`excluded.close`,
            currency: sql`excluded.currency`,
            source: sql`excluded.source`
          }
        });

      const latestPrice = historyRows[historyRows.length - 1];

      if (latestPrice) {
        await tx.insert(priceSnapshots)
          .values({
            instrumentId: instrument.id,
            price: latestPrice.close,
            currency: latestPrice.currency,
            asOf: latestPrice.priceDate,
            source: "local-seed"
          })
          .onConflictDoUpdate({
            target: priceSnapshots.instrumentId,
            set: {
              price: sql`excluded.price`,
              currency: sql`excluded.currency`,
              asOf: sql`excluded.as_of`,
              source: sql`excluded.source`
            }
          });
      }
    }

    for (const [symbol, intradayRows] of Object.entries(sampleIntradayPrices)) {
      const instrument = instrumentsBySymbol.get(symbol);

      if (!instrument) {
        continue;
      }

      await tx.insert(intradayPrices)
        .values(intradayRows.map((row) => ({
          instrumentId: instrument.id,
          observedAt: row.observedAt,
          close: row.close,
          currency: row.currency,
          interval: row.interval,
          source: "local-seed"
        })))
        .onConflictDoUpdate({
          target: [intradayPrices.instrumentId, intradayPrices.interval, intradayPrices.observedAt],
          set: {
            close: sql`excluded.close`,
            currency: sql`excluded.currency`,
            source: sql`excluded.source`
          }
        });
    }

    await tx.delete(marketRefreshRuns).where(sql`
      ${marketRefreshRuns.portfolioId} = ${mainPortfolio.id}
      AND ${marketRefreshRuns.refreshDate} = '2026-05-20'
      AND ${marketRefreshRuns.mode} = 'manual'
    `);
    await tx.insert(marketRefreshRuns)
      .values({
        portfolioId: mainPortfolio.id,
        refreshDate: "2026-05-20",
        mode: "manual",
        status: "success",
        attemptCount: 1,
        quoteRefreshCount: 4,
        historicalBarCount: 20,
        intradayBarCount: 12,
        issueCount: 0,
        latestSuccessfulAsOf: "2026-05-20",
        errorMessage: null,
        startedAt: "2026-05-20 09:00:00",
        completedAt: "2026-05-20 09:00:03"
      });

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

  console.log(
    `Database seeded with ${defaultInstruments.length} instruments, ${seededTransactionNotes.length} transactions, sample prices, and ${defaultSettings.length} settings.`
  );
}

main().catch((error) => {
  console.error("Database seed failed.", error);
  process.exit(1);
});
