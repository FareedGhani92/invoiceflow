CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`invoice_id` text,
	`message` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activities_owner_created` ON `activities` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `businesses` (
	`owner` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`next_number` integer DEFAULT 1000 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_owner` ON `customers` (`owner`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`invoice_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`provider_id` text,
	`error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deliveries_owner_invoice` ON `deliveries` (`owner`,`invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_invoice_kind` ON `deliveries` (`invoice_id`,`kind`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`number` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`data` text NOT NULL,
	`business` text,
	`total` integer NOT NULL,
	`created_at` text NOT NULL,
	`paid_at` text,
	`sample` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `invoices_owner_created` ON `invoices` (`owner`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_owner_number` ON `invoices` (`owner`,`number`);--> statement-breakpoint
CREATE TABLE `usage` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
