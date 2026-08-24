CREATE TABLE `project_deprovision_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`database_id` text NOT NULL,
	`database_name` text NOT NULL,
	`state` text DEFAULT 'PENDING' NOT NULL,
	`last_error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_deprovision_jobs_project_unique` ON `project_deprovision_jobs` (`project_id`);