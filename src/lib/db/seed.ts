import { sql } from "drizzle-orm";
import { createDatabaseHandle } from "./client";
import { appSettings, instruments, type NewInstrument } from "./schema";

const defaultInstruments: NewInstrument[] = [
  {
    symbol: "SPY",
    displayName: "SPDR S&P 500 ETF Trust",
    market: "US",
    instrumentType: "ETF",
    currency: "USD",
    providerSymbol: "SPY",
    isActive: true
  },
  {
    symbol: "AAPL80",
    displayName: "Apple DR",
    market: "TH",
    instrumentType: "DR",
    currency: "THB",
    providerSymbol: "AAPL80.BK",
    isActive: true
  }
];

const defaultSettings: Array<{ key: string; value: string }> = [
  { key: "benchmarkSymbol", value: "SPY" },
  { key: "marketRefreshMinutes", value: "30" },
  { key: "timezone", value: "Asia/Bangkok" },
  { key: "symbolOverrides", value: "{}" }
];
const { db, sqlite } = createDatabaseHandle();

try {
  db.transaction((tx) => {
    tx.insert(instruments)
      .values(defaultInstruments)
      .onConflictDoUpdate({
        target: instruments.symbol,
        set: {
          displayName: sql`excluded.display_name`,
          market: sql`excluded.market`,
          instrumentType: sql`excluded.instrument_type`,
          currency: sql`excluded.currency`,
          providerSymbol: sql`excluded.provider_symbol`,
          isActive: sql`excluded.is_active`,
          updatedAt: sql`CURRENT_TIMESTAMP`
        }
      })
      .run();

    for (const setting of defaultSettings) {
      tx.insert(appSettings)
        .values(setting)
        .onConflictDoUpdate({
          target: appSettings.key,
          set: {
            value: setting.value,
            updatedAt: sql`CURRENT_TIMESTAMP`
          }
        })
        .run();
    }
  });

  console.log(
    `Database seeded with ${defaultInstruments.length} instruments and ${defaultSettings.length} settings.`
  );
} finally {
  sqlite.close();
}
