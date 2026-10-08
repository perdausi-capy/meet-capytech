CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`run_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`last_error` text,
	`dedupe_key` text,
	`locked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_due_idx` ON `jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_active_dedupe_idx` ON `jobs` (`dedupe_key`) WHERE status IN ('queued', 'running');--> statement-breakpoint
ALTER TABLE `bookings` ADD `guest_timezone` text;