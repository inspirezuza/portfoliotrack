import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
};

export const instruments = sqliteTable(
  "instruments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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
    drRatio: real("dr_ratio"),
    fxProviderSymbol: text("fx_provider_symbol"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps
  },
  (table) => ({
    symbolUniqueIdx: uniqueIndex("instruments_symbol_unique").on(table.symbol),
    providerSymbolUniqueIdx: uniqueIndex("instruments_provider_symbol_unique").on(table.providerSymbol)
  })
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "restrict", onUpdate: "cascade" }),
    tradeDate: text("trade_date").notNull(),
    side: text("side").notNull(),
    quantity: real("quantity").notNull(),
    price: real("price").notNull(),
    fee: real("fee").notNull().default(0),
    notes: text("notes"),
    ...timestamps
  },
  (table) => ({
    // Deterministic same-day ordering is tradeDate, then createdAt, then id.
    tradeExecutionOrderIdx: index("transactions_trade_execution_order_idx").on(
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

export const priceSnapshots = sqliteTable(
  "price_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade", onUpdate: "cascade" }),
    price: real("price").notNull(),
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

export const historicalPrices = sqliteTable(
  "historical_prices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade", onUpdate: "cascade" }),
    priceDate: text("price_date").notNull(),
    close: real("close").notNull(),
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

export const intradayPrices = sqliteTable(
  "intraday_prices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade", onUpdate: "cascade" }),
    interval: text("interval").notNull(),
    observedAt: text("observed_at").notNull(),
    close: real("close").notNull(),
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

export const appSettings = sqliteTable(
  "app_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => ({
    keyUniqueIdx: uniqueIndex("app_settings_key_unique").on(table.key)
  })
);

export type Instrument = typeof instruments.$inferSelect;
export type NewInstrument = typeof instruments.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type HistoricalPrice = typeof historicalPrices.$inferSelect;
export type IntradayPrice = typeof intradayPrices.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
