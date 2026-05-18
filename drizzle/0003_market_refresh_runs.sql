CREATE TABLE IF NOT EXISTS "market_refresh_runs" (
  "id" serial PRIMARY KEY,
  "portfolio_id" integer NOT NULL REFERENCES "portfolios"("id") ON DELETE cascade ON UPDATE cascade,
  "refresh_date" text NOT NULL,
  "mode" text NOT NULL,
  "status" text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "quote_refresh_count" integer DEFAULT 0 NOT NULL,
  "historical_bar_count" integer DEFAULT 0 NOT NULL,
  "intraday_bar_count" integer DEFAULT 0 NOT NULL,
  "issue_count" integer DEFAULT 0 NOT NULL,
  "latest_successful_as_of" text,
  "error_message" text,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "market_refresh_runs_mode_check" CHECK ("mode" in ('daily-auto', 'manual')),
  CONSTRAINT "market_refresh_runs_status_check" CHECK ("status" in ('running', 'success', 'failed')),
  CONSTRAINT "market_refresh_runs_attempt_count_positive" CHECK ("attempt_count" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "market_refresh_runs_daily_auto_portfolio_date_unique"
  ON "market_refresh_runs" ("portfolio_id", "refresh_date")
  WHERE "mode" = 'daily-auto';

CREATE INDEX IF NOT EXISTS "market_refresh_runs_portfolio_date_idx"
  ON "market_refresh_runs" ("portfolio_id", "refresh_date");
