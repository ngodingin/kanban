import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    name: text("name").notNull(),
    image: text("image"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    token: text("token").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("auth_sessions_token_unique").on(t.token)],
);

export const authAccounts = sqliteTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("auth_accounts_provider_account_unique").on(t.providerId, t.accountId)],
);

export const authVerifications = sqliteTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("auth_verifications_identifier_unique").on(t.identifier)],
);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id),
  provisioningState: text("provisioning_state", {
    enum: ["PROVISIONING", "READY", "FAILED"],
  })
    .notNull()
    .default("PROVISIONING"),
  createdAt: text("created_at").notNull(),
});

export const projectDatabases = sqliteTable("project_databases", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id),
  databaseId: text("database_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const projectMemberships = sqliteTable(
  "project_memberships",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (t) => [uniqueIndex("project_memberships_project_user_unique").on(t.projectId, t.userId)],
);

export const permissions = sqliteTable("permissions", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  description: text("description"),
});

export const permissionGroups = sqliteTable(
  "permission_groups",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
    deletedAt: text("deleted_at"),
  },
  (t) => [index("permission_groups_project_idx").on(t.projectId)],
);

export const groupPermissions = sqliteTable(
  "group_permissions",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => permissionGroups.id),
    permissionId: text("permission_id")
      .notNull()
      .references(() => permissions.id),
    cardReadVisibility: text("card_read_visibility", {
      enum: ["CREATED_BY_ME", "ASSIGNED_TO_ME", "ALL"],
    }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("group_permissions_group_permission_unique").on(t.groupId, t.permissionId)],
);

export const scopedScopeType = ["project", "milestone", "board", "list", "card"] as const;
export type ScopedScopeType = (typeof scopedScopeType)[number];

export const membershipGroupAssignments = sqliteTable(
  "membership_group_assignments",
  {
    id: text("id").primaryKey(),
    membershipId: text("membership_id")
      .notNull()
      .references(() => projectMemberships.id),
    groupId: text("group_id")
      .notNull()
      .references(() => permissionGroups.id),
    scopeType: text("scope_type", { enum: scopedScopeType }).notNull(),
    scopeId: text("scope_id").notNull(),
    createdAt: text("created_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (t) => [
    uniqueIndex("membership_group_assignments_active_unique")
      .on(t.membershipId, t.groupId, t.scopeType, t.scopeId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

export const membershipPermissionAssignments = sqliteTable(
  "membership_permission_assignments",
  {
    id: text("id").primaryKey(),
    membershipId: text("membership_id")
      .notNull()
      .references(() => projectMemberships.id),
    permissionId: text("permission_id")
      .notNull()
      .references(() => permissions.id),
    scopeType: text("scope_type", { enum: scopedScopeType }).notNull(),
    scopeId: text("scope_id").notNull(),
    cardReadVisibility: text("card_read_visibility", {
      enum: ["CREATED_BY_ME", "ASSIGNED_TO_ME", "ALL"],
    }),
    createdAt: text("created_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (t) => [
    uniqueIndex("membership_permission_assignments_active_unique")
      .on(t.membershipId, t.permissionId, t.scopeType, t.scopeId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    email: text("email").notNull(),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: text("expires_at").notNull(),
    acceptedAt: text("accepted_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("invitations_project_idx").on(t.projectId)],
);

export const invitationGroupAssignments = sqliteTable(
  "invitation_group_assignments",
  {
    id: text("id").primaryKey(),
    invitationId: text("invitation_id")
      .notNull()
      .references(() => invitations.id),
    groupId: text("group_id")
      .notNull()
      .references(() => permissionGroups.id),
    scopeType: text("scope_type", { enum: scopedScopeType }).notNull(),
    scopeId: text("scope_id").notNull(),
  },
  (t) => [index("invitation_group_assignments_invitation_idx").on(t.invitationId)],
);

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
  },
  (t) => [index("api_keys_project_idx").on(t.projectId)],
);

export const personalAccessTokens = sqliteTable(
  "personal_access_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
  },
  (t) => [index("personal_access_tokens_user_idx").on(t.userId)],
);