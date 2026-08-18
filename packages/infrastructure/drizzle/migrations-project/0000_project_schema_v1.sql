CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`entity_version` integer NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "activities_entity_type_check" CHECK("activities"."entity_type" IN ('project', 'milestone', 'board', 'list', 'card'))
);
--> statement-breakpoint
CREATE INDEX `activities_entity_idx` ON `activities` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `board_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `board_labels_board_idx` ON `board_labels` (`board_id`);--> statement-breakpoint
CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`milestone_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `boards_milestone_idx` ON `boards` (`milestone_id`);--> statement-breakpoint
CREATE TABLE `card_board_labels` (
	`card_id` text NOT NULL,
	`label_id` text NOT NULL,
	`created_at` text NOT NULL,
	`removed_at` text,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`label_id`) REFERENCES `board_labels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_board_labels_active_unique` ON `card_board_labels` (`card_id`,`label_id`) WHERE "card_board_labels"."removed_at" IS NULL;--> statement-breakpoint
CREATE TABLE `card_milestone_labels` (
	`card_id` text NOT NULL,
	`label_id` text NOT NULL,
	`created_at` text NOT NULL,
	`removed_at` text,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`label_id`) REFERENCES `milestone_labels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_milestone_labels_active_unique` ON `card_milestone_labels` (`card_id`,`label_id`) WHERE "card_milestone_labels"."removed_at" IS NULL;--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`creator_user_id` text NOT NULL,
	`assignee_user_id` text,
	`title` text NOT NULL,
	`subtitle` text,
	`description` text,
	`due_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cards_list_idx` ON `cards` (`list_id`);--> statement-breakpoint
CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lists_board_idx` ON `lists` (`board_id`);--> statement-breakpoint
CREATE TABLE `milestone_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`milestone_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `milestone_labels_milestone_idx` ON `milestone_labels` (`milestone_id`);--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`progress` integer DEFAULT 0 NOT NULL,
	`start_date` text,
	`due_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `milestones_archived_idx` ON `milestones` (`archived_at`);--> statement-breakpoint
CREATE TABLE `project_state` (
	`project_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL
);
