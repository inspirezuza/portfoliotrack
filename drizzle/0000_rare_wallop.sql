CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_settings_key_unique` ON `app_settings` (`key`);--> statement-breakpoint
CREATE TABLE `historical_prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instrument_id` integer NOT NULL,
	`price_date` text NOT NULL,
	`close` real NOT NULL,
	`currency` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "historical_prices_close_non_negative" CHECK("historical_prices"."close" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `historical_prices_instrument_date_unique` ON `historical_prices` (`instrument_id`,`price_date`);--> statement-breakpoint
CREATE INDEX `historical_prices_price_date_idx` ON `historical_prices` (`price_date`);--> statement-breakpoint
CREATE TABLE `instruments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`display_name` text NOT NULL,
	`market` text NOT NULL,
	`instrument_type` text NOT NULL,
	`currency` text NOT NULL,
	`provider_symbol` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instruments_symbol_unique` ON `instruments` (`symbol`);--> statement-breakpoint
CREATE UNIQUE INDEX `instruments_provider_symbol_unique` ON `instruments` (`provider_symbol`);--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instrument_id` integer NOT NULL,
	`price` real NOT NULL,
	`currency` text NOT NULL,
	`as_of` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "price_snapshots_price_non_negative" CHECK("price_snapshots"."price" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_snapshots_instrument_unique` ON `price_snapshots` (`instrument_id`);--> statement-breakpoint
CREATE INDEX `price_snapshots_as_of_idx` ON `price_snapshots` (`as_of`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instrument_id` integer NOT NULL,
	`trade_date` text NOT NULL,
	`side` text NOT NULL,
	`quantity` real NOT NULL,
	`price` real NOT NULL,
	`fee` real DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "transactions_quantity_positive" CHECK("transactions"."quantity" > 0),
	CONSTRAINT "transactions_price_positive" CHECK("transactions"."price" >= 0),
	CONSTRAINT "transactions_fee_positive" CHECK("transactions"."fee" >= 0),
	CONSTRAINT "transactions_side_check" CHECK("transactions"."side" in ('BUY', 'SELL'))
);
--> statement-breakpoint
CREATE INDEX `transactions_trade_execution_order_idx` ON `transactions` (`instrument_id`,`trade_date`,`created_at`,`id`);