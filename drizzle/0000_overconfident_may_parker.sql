CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`favorite` integer DEFAULT 0 NOT NULL,
	`color` text DEFAULT '#ffd76a' NOT NULL,
	`scene_key` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
