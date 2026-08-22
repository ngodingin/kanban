CREATE TABLE `__new_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`entity_version` integer NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "activities_entity_type_check" CHECK("entity_type" IN ('project', 'milestone', 'board', 'list', 'card', 'milestone_label', 'board_label'))
);
--> statement-breakpoint
INSERT INTO `__new_activities`("id", "entity_type", "entity_id", "entity_version", "actor_user_id", "action", "data", "created_at") SELECT "id", "entity_type", "entity_id", "entity_version", "actor_user_id", "action", "data", "created_at" FROM `activities`;--> statement-breakpoint
DROP TABLE `activities`;--> statement-breakpoint
ALTER TABLE `__new_activities` RENAME TO `activities`;--> statement-breakpoint
CREATE INDEX `activities_entity_idx` ON `activities` (`entity_type`,`entity_id`);
