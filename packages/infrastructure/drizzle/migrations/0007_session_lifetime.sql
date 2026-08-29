-- TASK-7.15.0 / SOT 4.3.0: legacy sessions used a seven-day lifetime and do
-- not carry the immutable weekly boundary. They must not survive this policy
-- migration.
DELETE FROM `auth_sessions`;
--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `last_activity_at` integer NOT NULL;
--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `absolute_expires_at` integer NOT NULL;
