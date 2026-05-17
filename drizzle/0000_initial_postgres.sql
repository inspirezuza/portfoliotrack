CREATE TABLE IF NOT EXISTS "instruments" (
  "id" serial PRIMARY KEY,
  "symbol" text NOT NULL,
  "display_name" text NOT NULL,
  "market" text NOT NULL,
  "instrument_type" text NOT NULL,
  "currency" text NOT NULL,
  "provider_symbol" text NOT NULL,
  "underlying_symbol" text,
  "underlying_display_name" text,
  "underlying_currency" text,
  "underlying_provider_symbol" text,
  "dr_ratio" double precision,
  "fx_provider_symbol" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "transactions" (
  "id" serial PRIMARY KEY,
  "instrument_id" integer NOT NULL REFERENCES "instruments"("id") ON DELETE restrict ON UPDATE cascade,
  "trade_date" text NOT NULL,
  "side" text NOT NULL,
  "quantity" double precision NOT NULL,
  "price" double precision NOT NULL,
  "fee" double precision DEFAULT 0 NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "transactions_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "transactions_price_positive" CHECK ("price" >= 0),
  CONSTRAINT "transactions_fee_positive" CHECK ("fee" >= 0),
  CONSTRAINT "transactions_side_check" CHECK ("side" in ('BUY', 'SELL'))
);

CREATE TABLE IF NOT EXISTS "price_snapshots" (
  "id" serial PRIMARY KEY,
  "instrument_id" integer NOT NULL REFERENCES "instruments"("id") ON DELETE cascade ON UPDATE cascade,
  "price" double precision NOT NULL,
  "currency" text NOT NULL,
  "as_of" text NOT NULL,
  "source" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "price_snapshots_price_non_negative" CHECK ("price" >= 0)
);

CREATE TABLE IF NOT EXISTS "historical_prices" (
  "id" serial PRIMARY KEY,
  "instrument_id" integer NOT NULL REFERENCES "instruments"("id") ON DELETE cascade ON UPDATE cascade,
  "price_date" text NOT NULL,
  "close" double precision NOT NULL,
  "currency" text NOT NULL,
  "source" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "historical_prices_close_non_negative" CHECK ("close" >= 0)
);

CREATE TABLE IF NOT EXISTS "intraday_prices" (
  "id" serial PRIMARY KEY,
  "instrument_id" integer NOT NULL REFERENCES "instruments"("id") ON DELETE cascade ON UPDATE cascade,
  "interval" text NOT NULL,
  "observed_at" text NOT NULL,
  "close" double precision NOT NULL,
  "currency" text NOT NULL,
  "source" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "intraday_prices_close_non_negative" CHECK ("close" >= 0),
  CONSTRAINT "intraday_prices_interval_check" CHECK ("interval" in ('5m', '15m', '1h'))
);

CREATE TABLE IF NOT EXISTS "app_settings" (
  "id" serial PRIMARY KEY,
  "key" text NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "instruments_symbol_unique" ON "instruments" ("symbol");
CREATE UNIQUE INDEX IF NOT EXISTS "instruments_provider_symbol_unique" ON "instruments" ("provider_symbol");
CREATE INDEX IF NOT EXISTS "transactions_trade_execution_order_idx" ON "transactions" ("instrument_id", "trade_date", "created_at", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "price_snapshots_instrument_unique" ON "price_snapshots" ("instrument_id");
CREATE INDEX IF NOT EXISTS "price_snapshots_as_of_idx" ON "price_snapshots" ("as_of");
CREATE UNIQUE INDEX IF NOT EXISTS "historical_prices_instrument_date_unique" ON "historical_prices" ("instrument_id", "price_date");
CREATE INDEX IF NOT EXISTS "historical_prices_price_date_idx" ON "historical_prices" ("price_date");
CREATE UNIQUE INDEX IF NOT EXISTS "intraday_prices_instrument_interval_observed_unique" ON "intraday_prices" ("instrument_id", "interval", "observed_at");
CREATE INDEX IF NOT EXISTS "intraday_prices_observed_at_idx" ON "intraday_prices" ("observed_at");
CREATE INDEX IF NOT EXISTS "intraday_prices_instrument_interval_observed_idx" ON "intraday_prices" ("instrument_id", "interval", "observed_at");
CREATE UNIQUE INDEX IF NOT EXISTS "app_settings_key_unique" ON "app_settings" ("key");
