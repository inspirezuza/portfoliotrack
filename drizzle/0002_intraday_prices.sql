CREATE TABLE `intraday_prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instrument_id` integer NOT NULL,
	`interval` text NOT NULL,
	`observed_at` text NOT NULL,
	`close` real NOT NULL,
	`currency` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "intraday_prices_close_non_negative" CHECK("intraday_prices"."close" >= 0),
	CONSTRAINT "intraday_prices_interval_check" CHECK("intraday_prices"."interval" in ('5m', '15m', '1h'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `intraday_prices_instrument_interval_observed_unique` ON `intraday_prices` (`instrument_id`,`interval`,`observed_at`);--> statement-breakpoint
CREATE INDEX `intraday_prices_observed_at_idx` ON `intraday_prices` (`observed_at`);--> statement-breakpoint
CREATE INDEX `intraday_prices_instrument_interval_observed_idx` ON `intraday_prices` (`instrument_id`,`interval`,`observed_at`);