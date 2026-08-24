-- Skema idempotency_keys TASK-0.16 lama tidak kompatibel dengan state
-- machine atomic claim baru (field wajib baru: request_fingerprint,
-- claim_token, state — tidak bisa di-backfill dari data lama). Data lama
-- bersifat ephemeral by design (TTL, belum ada traffic produksi nyata) —
-- drop bersih lebih aman daripada INSERT...SELECT kolom yang tidak ada.
DROP TABLE IF EXISTS `idempotency_keys`;--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`scope` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`claim_token` text NOT NULL,
	`state` text NOT NULL,
	`response_status` integer,
	`result` text,
	`lease_expires_at` text,
	`expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_keys_key_scope_unique` ON `idempotency_keys` (`key`,`scope`);--> statement-breakpoint
CREATE INDEX `idempotency_keys_lease_idx` ON `idempotency_keys` (`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `idempotency_keys_expires_idx` ON `idempotency_keys` (`expires_at`);
