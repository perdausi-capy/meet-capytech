CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`type_slug` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`company` text,
	`notes` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`event_id` text,
	`manage_token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_manage_token_hash_unique` ON `bookings` (`manage_token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `double_booking_guard_idx` ON `bookings` (`starts_at`) WHERE status IN ('pending', 'confirmed');--> statement-breakpoint
CREATE INDEX `updated_at_idx` ON `bookings` (`updated_at`);--> statement-breakpoint
CREATE TABLE `busy_cache` (
	`source` text PRIMARY KEY NOT NULL,
	`range_from` text NOT NULL,
	`range_to` text NOT NULL,
	`ranges_json` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `google_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`refresh_token_enc` text NOT NULL,
	`access_token_enc` text NOT NULL,
	`expires_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
