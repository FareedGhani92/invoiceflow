CREATE TABLE `automation_state` (
	`name` text PRIMARY KEY NOT NULL,
	`cursor` text DEFAULT '' NOT NULL,
	`last_run_at` text,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `delivery_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`type` text NOT NULL,
	`received_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `delivery_events_provider` ON `delivery_events` (`provider_id`);