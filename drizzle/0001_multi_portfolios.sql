CREATE TABLE IF NOT EXISTS "portfolios" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "portfolios_name_unique" ON "portfolios" ("name");
CREATE UNIQUE INDEX IF NOT EXISTS "portfolios_default_unique" ON "portfolios" ("is_default") WHERE "is_default" = true;

INSERT INTO "portfolios" ("name", "is_default")
SELECT 'Main Portfolio', true
WHERE NOT EXISTS (SELECT 1 FROM "portfolios");

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "portfolio_id" integer;

UPDATE "transactions"
SET "portfolio_id" = (
  SELECT "id"
  FROM "portfolios"
  ORDER BY "is_default" DESC, "id" ASC
  LIMIT 1
)
WHERE "portfolio_id" IS NULL;

ALTER TABLE "transactions" ALTER COLUMN "portfolio_id" SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE "transactions"
    ADD CONSTRAINT "transactions_portfolio_id_portfolios_id_fk"
    FOREIGN KEY ("portfolio_id")
    REFERENCES "portfolios"("id")
    ON DELETE cascade
    ON UPDATE cascade;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP INDEX IF EXISTS "transactions_trade_execution_order_idx";
CREATE INDEX IF NOT EXISTS "transactions_trade_execution_order_idx" ON "transactions" ("portfolio_id", "instrument_id", "trade_date", "created_at", "id");
