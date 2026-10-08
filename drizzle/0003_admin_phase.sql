CREATE TABLE `availability_overrides` (
	`date` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`windows_json` text DEFAULT '[]' NOT NULL,
	`note` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meeting_types` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`duration_minutes` integer NOT NULL,
	`buffer_before_minutes` integer DEFAULT 0 NOT NULL,
	`buffer_after_minutes` integer DEFAULT 0 NOT NULL,
	`location_kind` text DEFAULT 'google_meet' NOT NULL,
	`location_detail` text,
	`max_per_day` integer,
	`is_private` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_types_slug_unique` ON `meeting_types` (`slug`);--> statement-breakpoint
CREATE INDEX `meeting_types_status_idx` ON `meeting_types` (`status`,`sort_order`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `host_notes` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `attendance` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `cancelled_by` text;