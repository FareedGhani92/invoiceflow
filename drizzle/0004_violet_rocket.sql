CREATE TABLE `auth_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL DEFAULT 0,
	`reset_at` text NOT NULL
);
