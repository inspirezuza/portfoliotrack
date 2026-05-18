ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "broker" text DEFAULT 'DIME';

UPDATE "transactions"
SET "broker" = 'DIME'
WHERE "broker" IS NULL;

ALTER TABLE "transactions" ALTER COLUMN "broker" SET DEFAULT 'DIME';
ALTER TABLE "transactions" ALTER COLUMN "broker" SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE "transactions"
    ADD CONSTRAINT "transactions_broker_check"
    CHECK ("broker" in ('DIME', 'WEBULL'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
