import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex, index, check } from "drizzle-orm/sqlite-core";

export const projectState = sqliteTable("project_state", {
  projectId: text("project_id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  archivedAt: text("archived_at"),
  deletedAt: text("deleted_at"),
  version: integer("version").notNull().default(1),
});

export const milestones = sqliteTable(
  "milestones",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    progress: integer("progress").notNull().default(0),
    startDate: text("start_date"),
    dueDate: text("due_date"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
    deletedAt: text("deleted_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [index("milestones_archived_idx").on(t.archivedAt)],
);

export const boards = sqliteTable(
  "boards",
  {
    id: text("id").primaryKey(),
    milestoneId: text("milestone_id")
      .notNull()
      .references(() => milestones.id),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
    deletedAt: text("deleted_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [index("boards_milestone_idx").on(t.milestoneId)],
);

export const lists = sqliteTable(
  "lists",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    title: text("title").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
    deletedAt: text("deleted_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [index("lists_board_idx").on(t.boardId)],
);

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id),
    creatorUserId: text("creator_user_id").notNull(),
    assigneeUserId: text("assignee_user_id"),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    dueDate: text("due_date"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
    deletedAt: text("deleted_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [index("cards_list_idx").on(t.listId)],
);

export const milestoneLabels = sqliteTable(
  "milestone_labels",
  {
    id: text("id").primaryKey(),
    milestoneId: text("milestone_id")
      .notNull()
      .references(() => milestones.id),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
    deletedAt: text("deleted_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [index("milestone_labels_milestone_idx").on(t.milestoneId)],
);

export const boardLabels = sqliteTable(
  "board_labels",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
    deletedAt: text("deleted_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [index("board_labels_board_idx").on(t.boardId)],
);

export const cardMilestoneLabels = sqliteTable(
  "card_milestone_labels",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id),
    labelId: text("label_id")
      .notNull()
      .references(() => milestoneLabels.id),
    createdAt: text("created_at").notNull(),
    removedAt: text("removed_at"),
  },
  (t) => [
    uniqueIndex("card_milestone_labels_active_unique")
      .on(t.cardId, t.labelId)
      .where(sql`${t.removedAt} IS NULL`),
  ],
);

export const cardBoardLabels = sqliteTable(
  "card_board_labels",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id),
    labelId: text("label_id")
      .notNull()
      .references(() => boardLabels.id),
    createdAt: text("created_at").notNull(),
    removedAt: text("removed_at"),
  },
  (t) => [
    uniqueIndex("card_board_labels_active_unique")
      .on(t.cardId, t.labelId)
      .where(sql`${t.removedAt} IS NULL`),
  ],
);

export const activityEntityType = ["project", "milestone", "board", "list", "card"] as const;
export type ActivityEntityType = (typeof activityEntityType)[number];

export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type", { enum: activityEntityType }).notNull(),
    entityId: text("entity_id").notNull(),
    entityVersion: integer("entity_version").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    data: text("data", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("activities_entity_idx").on(t.entityType, t.entityId),
    check("activities_entity_type_check", sql`${t.entityType} IN ('project', 'milestone', 'board', 'list', 'card')`),
  ],
);