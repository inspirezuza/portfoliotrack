ALTER TABLE "market_refresh_runs"
  ADD COLUMN IF NOT EXISTS "target_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "processed_target_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "current_symbol" text,
  ADD COLUMN IF NOT EXISTS "worker_heartbeat_at" timestamp,
  ADD COLUMN IF NOT EXISTS "last_processed_instrument_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'market_refresh_runs_target_count_positive'
  ) THEN
    ALTER TABLE "market_refresh_runs"
      ADD CONSTRAINT "market_refresh_runs_target_count_positive" CHECK ("target_count" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'market_refresh_runs_processed_target_count_positive'
  ) THEN
    ALTER TABLE "market_refresh_runs"
      ADD CONSTRAINT "market_refresh_runs_processed_target_count_positive" CHECK ("processed_target_count" >= 0);
  END IF;
END $$;
