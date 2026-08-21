PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invitation_group_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`group_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `permission_groups`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invitation_group_assignments_scope_check" CHECK("__new_invitation_group_assignments"."scope_type" IN ('project', 'milestone', 'board', 'list', 'card'))
);
--> statement-breakpoint
INSERT INTO `__new_invitation_group_assignments`("id", "invitation_id", "group_id", "scope_type", "scope_id") SELECT "id", "invitation_id", "group_id", "scope_type", "scope_id" FROM `invitation_group_assignments`;--> statement-breakpoint
DROP TABLE `invitation_group_assignments`;--> statement-breakpoint
ALTER TABLE `__new_invitation_group_assignments` RENAME TO `invitation_group_assignments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `invitation_group_assignments_invitation_idx` ON `invitation_group_assignments` (`invitation_id`);--> statement-breakpoint
CREATE TABLE `__new_membership_group_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`membership_id` text NOT NULL,
	`group_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`membership_id`) REFERENCES `project_memberships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `permission_groups`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "membership_group_assignments_scope_check" CHECK("__new_membership_group_assignments"."scope_type" IN ('project', 'milestone', 'board', 'list', 'card'))
);
--> statement-breakpoint
INSERT INTO `__new_membership_group_assignments`("id", "membership_id", "group_id", "scope_type", "scope_id", "created_at", "revoked_at") SELECT "id", "membership_id", "group_id", "scope_type", "scope_id", "created_at", "revoked_at" FROM `membership_group_assignments`;--> statement-breakpoint
DROP TABLE `membership_group_assignments`;--> statement-breakpoint
ALTER TABLE `__new_membership_group_assignments` RENAME TO `membership_group_assignments`;--> statement-breakpoint
CREATE UNIQUE INDEX `membership_group_assignments_active_unique` ON `membership_group_assignments` (`membership_id`,`group_id`,`scope_type`,`scope_id`) WHERE "membership_group_assignments"."revoked_at" IS NULL;--> statement-breakpoint
CREATE TABLE `__new_membership_permission_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`membership_id` text NOT NULL,
	`permission_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`card_read_visibility` text,
	`created_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`membership_id`) REFERENCES `project_memberships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "membership_permission_assignments_scope_check" CHECK("__new_membership_permission_assignments"."scope_type" IN ('project', 'milestone', 'board', 'list', 'card')),
	CONSTRAINT "membership_permission_assignments_visibility_check" CHECK("__new_membership_permission_assignments"."card_read_visibility" IS NULL OR "__new_membership_permission_assignments"."card_read_visibility" IN ('CREATED_BY_ME', 'ASSIGNED_TO_ME', 'ALL'))
);
--> statement-breakpoint
INSERT INTO `__new_membership_permission_assignments`("id", "membership_id", "permission_id", "scope_type", "scope_id", "card_read_visibility", "created_at", "revoked_at") SELECT "id", "membership_id", "permission_id", "scope_type", "scope_id", "card_read_visibility", "created_at", "revoked_at" FROM `membership_permission_assignments`;--> statement-breakpoint
DROP TABLE `membership_permission_assignments`;--> statement-breakpoint
ALTER TABLE `__new_membership_permission_assignments` RENAME TO `membership_permission_assignments`;--> statement-breakpoint
CREATE UNIQUE INDEX `membership_permission_assignments_active_unique` ON `membership_permission_assignments` (`membership_id`,`permission_id`,`scope_type`,`scope_id`) WHERE "membership_permission_assignments"."revoked_at" IS NULL;