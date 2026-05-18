import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  text,
  uniqueIndex
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" })
    .notNull()
    .defaultNow()
};

export const instruments = pgTable(
  "instruments",
  {
    id: serial("id").primaryKey(),
    symbol: text("symbol").notNull(),
    displayName: text("display_name").notNull(),
    market: text("market").notNull(),
    instrumentType: text("instrument_type").notNull(),
    currency: text("currency").notNull(),
    providerSymbol: text("provider_symbol").notNull(),
    underlyingSymbol: text("underlying_symbol"),
    underlyingDisplayName: text("underlying_display_name"),
    underlyingCurrency: text("underlying_currency"),
    underlyingProviderSymbol: text("underlying_provider_symbol"),
    drRatio: doublePrecision("dr_ratio"),
    fxProviderSymbol: text("fx_provider_symbol"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps
  },
  (table) => ({
    symbolUniqueIdx: uniqueIndex("instruments_symbol_unique").on(table.symbol),
    providerSymbolUniqueIdx: uniqueIndex("instruments_provider_symbol_unique").on(table.providerSymbol)
  })
);

export const portfolios = pgTable(
  "portfolios",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps
  },
  (table) => ({
    nameUniqueIdx: uniqueIndex("portfolios_name_unique").on(table.name),
    defaultUniqueIdx: uniqueIndex("portfolios_default_unique").on(table.isDefault).where(
      sql`${table.isDefault} = true`
    )
  })
);

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    portfolioId: integer("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade", onUpdate: "cascade" }),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "restrict", onUpdate: "cascade" }),
    tradeDate: text("trade_date").notNull(),
    side: text("side").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    price: doublePrecision("price").notNull(),
    fee: doublePrecision("fee").notNull().default(0),
    notes: text("notes"),
    ...timestamps
  },
  (table) => ({
    // Deterministic same-day ordering is tradeDate, then createdAt, then id.
    tradeExecutionOrderIdx: index("transactions_trade_execution_order_idx").on(
      table.portfolioId,
      table.instrumentId,
      table.tradeDate,
      table.createdAt,
      table.id
    ),
    quantityPositive: check("transactions_quantity_positive", sql`${table.quantity} > 0`),
    pricePositive: check("transactions_price_positive", sql`${table.price} >= 0`),
    feePositive: check("transactions_fee_positive", sql`${table.fee} >= 0`),
    sideCheck: check("transactions_side_check", sql`${table.side} in ('BUY', 'SELL')`)
  })
);

export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    id: serial("id").primaryKey(),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade", onUpdate: "cascade" }),
    price: doublePrecision("price").notNull(),
    currency: text("currency").notNull(),
    asOf: text("as_of").notNull(),
    source: text("source").notNull(),
    createdAt: timestamps.createdAt
  },
  (table) => ({
    instrumentUniqueIdx: uniqueIndex("price_snapshots_instrument_unique").on(table.instrumentId),
    asOfIdx: index("price_snapshots_as_of_idx").on(table.asOf),
    priceNonNegative: check("price_snapshots_price_non_negative", sql`${table.price} >= 0`)
  })
);

export const historicalPrices = pgTable(
  "historical_prices",
  {
    id: serial("id").primaryKey(),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade", onUpdate: "cascade" }),
    priceDate: text("price_date").notNull(),
    close: doublePrecision("close").notNull(),
    currency: text("currency").notNull(),
    source: text("source").notNull(),
    createdAt: timestamps.createdAt
  },
  (table) => ({
    instrumentPriceDateUniqueIdx: uniqueIndex("historical_prices_instrument_date_unique").on(
      table.instrumentId,
      table.priceDate
    ),
    priceDateIdx: index("historical_prices_price_date_idx").on(table.priceDate),
    closeNonNegative: check("historical_prices_close_non_negative", sql`${table.close} >= 0`)
  })
);

export const intradayPrices = pgTable(
  "intraday_prices",
  {
    id: serial("id").primaryKey(),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade", onUpdate: "cascade" }),
    interval: text("interval").notNull(),
    observedAt: text("observed_at").notNull(),
    close: doublePrecision("close").notNull(),
    currency: text("currency").notNull(),
    source: text("source").notNull(),
    createdAt: timestamps.createdAt
  },
  (table) => ({
    instrumentIntervalObservedUniqueIdx: uniqueIndex("intraday_prices_instrument_interval_observed_unique").on(
      table.instrumentId,
      table.interval,
      table.observedAt
    ),
    observedAtIdx: index("intraday_prices_observed_at_idx").on(table.observedAt),
    instrumentIntervalObservedIdx: index("intraday_prices_instrument_interval_observed_idx").on(
      table.instrumentId,
      table.interval,
      table.observedAt
    ),
    closeNonNegative: check("intraday_prices_close_non_negative", sql`${table.close} >= 0`),
    intervalCheck: check("intraday_prices_interval_check", sql`${table.interval} in ('5m', '15m', '1h')`)
  })
);

export const appSettings = pgTable(
  "app_settings",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    keyUniqueIdx: uniqueIndex("app_settings_key_unique").on(table.key)
  })
);

export const marketRefreshRuns = pgTable(
  "market_refresh_runs",
  {
    id: serial("id").primaryKey(),
    portfolioId: integer("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade", onUpdate: "cascade" }),
    refreshDate: text("refresh_date").notNull(),
    mode: text("mode").notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    quoteRefreshCount: integer("quote_refresh_count").notNull().default(0),
    historicalBarCount: integer("historical_bar_count").notNull().default(0),
    intradayBarCount: integer("intraday_bar_count").notNull().default(0),
    issueCount: integer("issue_count").notNull().default(0),
    latestSuccessfulAsOf: text("latest_successful_as_of"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { mode: "string" }),
    completedAt: timestamp("completed_at", { mode: "string" }),
    ...timestamps
  },
  (table) => ({
    dailyAutoPortfolioDateUniqueIdx: uniqueIndex("market_refresh_runs_daily_auto_portfolio_date_unique").on(
      table.portfolioId,
      table.refreshDate
    ).where(sql`${table.mode} = 'daily-auto'`),
    portfolioDateIdx: index("market_refresh_runs_portfolio_date_idx").on(
      table.portfolioId,
      table.refreshDate
    ),
    modeCheck: check("market_refresh_runs_mode_check", sql`${table.mode} in ('daily-auto', 'manual')`),
    statusCheck: check("market_refresh_runs_status_check", sql`${table.status} in ('running', 'success', 'failed')`),
    attemptCountPositive: check("market_refresh_runs_attempt_count_positive", sql`${table.attemptCount} >= 0`)
  })
);

export type Instrument = typeof instruments.$inferSelect;
export type NewInstrument = typeof instruments.$inferInsert;
export type Portfolio = typeof portfolios.$inferSelect;
export type NewPortfolio = typeof portfolios.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type HistoricalPrice = typeof historicalPrices.$inferSelect;
export type IntradayPrice = typeof intradayPrices.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type MarketRefreshRun = typeof marketRefreshRuns.$inferSelect;
