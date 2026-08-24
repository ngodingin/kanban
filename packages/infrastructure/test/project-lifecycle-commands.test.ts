import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ProjectInvalidStateError,
  ProjectNotFoundError,
  ProjectVersionConflictError,
} from "@kanban/domain";
import { DrizzleProjectRepository } from "../src/database/project-repository.ts";
import { createTestProjectDb, type TestDb } from "./helpers/db.ts";

const T0 = "2026-08-01T00:00:00.000Z";
const OWNER = "user_owner_1";

let db: TestDb;
let repo: DrizzleProjectRepository;

async function seedProject(
  id: string,
  opts: { name?: string; archivedAt?: string | null; deletedAt?: string | null; version?: number } = {},
): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [id, opts.name ?? "Alpha", T0, T0, opts.archivedAt ?? null, opts.deletedAt ?? null, opts.version ?? 1],
  });
}

async function activityCount(): Promise<number> {
  const r = await db.client.execute("SELECT COUNT(*) AS n FROM activities");
  return Number(r.rows[0]?.n);
}

interface ActivityRow {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_version: number;
  actor_user_id: string;
  action: string;
  data: string;
}

async function listActivities(): Promise<ActivityRow[]> {
  const r = await db.client.execute("SELECT * FROM activities");
  return r.rows.map((row) => ({
    id: String(row.id),
    entity_type: String(row.entity_type),
    entity_id: String(row.entity_id),
    entity_version: Number(row.entity_version),
    actor_user_id: String(row.actor_user_id),
    action: String(row.action),
    data: String(row.data),
  }));
}

beforeAll(async () => {
  db = await createTestProjectDb();
  repo = new DrizzleProjectRepository(db.client);
});

afterEach(async () => {
  await db.truncateAll();
});

afterAll(async () => {
  await db.cleanup();
});

describe("DrizzleProjectRepository — project lifecycle domain commands (goal 1.1.1)", () => {
  describe("positif — commit version + timestamp + Activity (BR-019, BR-025, BR-026)", () => {
    it("updateProjectName mengubah nama, version+1, updated_at, dan menulis Activity project.updated", async () => {
      await seedProject("proj_1", { name: "Lama" });
      const result = await repo.updateProjectName({
        projectId: "proj_1",
        expectedVersion: 1,
        actorUserId: OWNER,
        name: "Baru",
      });
      expect(result.name).toBe("Baru");
      expect(result.version).toBe(2);
      expect(result.updatedAt).not.toBe(T0);
      expect(result.archivedAt).toBeNull();
      expect(result.deletedAt).toBeNull();

      const persisted = await repo.getProjectState("proj_1");
      expect(persisted).toMatchObject({ name: "Baru", version: 2 });

      const acts = await listActivities();
      expect(acts).toHaveLength(1);
      expect(acts[0]).toMatchObject({
        entity_type: "project",
        entity_id: "proj_1",
        entity_version: 2,
        actor_user_id: OWNER,
        action: "project.updated",
      });
      const data = JSON.parse(acts[0].data);
      expect(data.changes.name).toEqual({ before: "Lama", after: "Baru" });
    });

    it("archiveProject dari ACTIVE mengisi archived_at dan menulis Activity project.archived", async () => {
      await seedProject("proj_1");
      const result = await repo.archiveProject({ projectId: "proj_1", expectedVersion: 1, actorUserId: OWNER });
      expect(result.archivedAt).not.toBeNull();
      expect(result.deletedAt).toBeNull();
      expect(result.version).toBe(2);

      const acts = await listActivities();
      expect(acts[0]).toMatchObject({ action: "project.archived", entity_version: 2 });
      expect(JSON.parse(acts[0].data)).toEqual({ previousState: "ACTIVE" });
    });

    it("restoreProject dari ARCHIVED mengosongkan archived_at dan menulis Activity project.restored", async () => {
      await seedProject("proj_1", { archivedAt: T0, version: 2 });
      const result = await repo.restoreProject({ projectId: "proj_1", expectedVersion: 2, actorUserId: OWNER });
      expect(result.archivedAt).toBeNull();
      expect(result.deletedAt).toBeNull();
      expect(result.version).toBe(3);

      const acts = await listActivities();
      expect(acts[0]).toMatchObject({ action: "project.restored", entity_version: 3 });
      expect(JSON.parse(acts[0].data)).toEqual({ previousState: "ARCHIVED" });
    });

    it("deleteProject dari ARCHIVED diizinkan (state machine A.3: ARCHIVED -> DELETED)", async () => {
      await seedProject("proj_1", { archivedAt: T0, version: 2 });
      const result = await repo.deleteProject({ projectId: "proj_1", expectedVersion: 2, actorUserId: OWNER });
      expect(result.deletedAt).not.toBeNull();
      expect(result.version).toBe(3);

      const acts = await listActivities();
      expect(acts[0]).toMatchObject({ action: "project.deleted", entity_version: 3 });
      expect(JSON.parse(acts[0].data)).toEqual({ previousState: "ARCHIVED" });
    });

    it("deleteProject dari ACTIVE diizinkan (state machine A.3: ACTIVE -> DELETED)", async () => {
      await seedProject("proj_1");
      const result = await repo.deleteProject({ projectId: "proj_1", expectedVersion: 1, actorUserId: OWNER });
      expect(result.deletedAt).not.toBeNull();

      const acts = await listActivities();
      expect(JSON.parse(acts[0].data)).toEqual({ previousState: "ACTIVE" });
    });

    it("siklus archive lalu restore menghasilkan dua Activity terpisah dan version monoton naik (BR-019)", async () => {
      await seedProject("proj_1");
      await repo.archiveProject({ projectId: "proj_1", expectedVersion: 1, actorUserId: OWNER });
      await repo.restoreProject({ projectId: "proj_1", expectedVersion: 2, actorUserId: OWNER });

      const state = await repo.getProjectState("proj_1");
      expect(state).toMatchObject({ version: 3, archivedAt: null, deletedAt: null });

      const acts = await listActivities();
      expect(acts.map((a) => a.action)).toEqual(["project.archived", "project.restored"]);
    });
  });

  describe("negatif — optimistic locking (BR-021, pola AC-020)", () => {
    it.each([
      { op: "update" as const, label: "updateProjectName", seed: {} },
      { op: "archive" as const, label: "archiveProject", seed: {} },
      { op: "archive" as const, label: "archiveProject (ARCHIVED)", seed: { archivedAt: T0, version: 2 } },
      { op: "restore" as const, label: "restoreProject", seed: { archivedAt: T0, version: 2 } },
      { op: "delete" as const, label: "deleteProject", seed: { version: 5 } },
    ])("$label dengan expected_version salah → VERSION_CONFLICT, tanpa perubahan state & tanpa Activity", async ({ op, seed }) => {
      await seedProject("proj_1", seed);
      const before = await repo.getProjectState("proj_1");

      const call = (): Promise<unknown> => {
        if (op === "update") {
          return repo.updateProjectName({
            projectId: "proj_1",
            expectedVersion: (before?.version ?? 0) + 100,
            actorUserId: OWNER,
            name: "Konflik",
          });
        }
        if (op === "archive") {
          return repo.archiveProject({ projectId: "proj_1", expectedVersion: 999, actorUserId: OWNER });
        }
        if (op === "restore") {
          return repo.restoreProject({ projectId: "proj_1", expectedVersion: 999, actorUserId: OWNER });
        }
        return repo.deleteProject({ projectId: "proj_1", expectedVersion: 999, actorUserId: OWNER });
      };

      await expect(call).rejects.toBeInstanceOf(ProjectVersionConflictError);
      await expect(call()).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

      const after = await repo.getProjectState("proj_1");
      expect(after).toEqual(before);
      expect(await activityCount()).toBe(0);
    });

    it("penulis kedua yang masih memegang version lama ditolak — last valid write wins (BR-022)", async () => {
      await seedProject("proj_1", { name: "Awal" });
      await repo.updateProjectName({ projectId: "proj_1", expectedVersion: 1, actorUserId: OWNER, name: "Pertama" });
      await expect(
        repo.updateProjectName({ projectId: "proj_1", expectedVersion: 1, actorUserId: OWNER, name: "Kedua" }),
      ).rejects.toBeInstanceOf(ProjectVersionConflictError);

      const state = await repo.getProjectState("proj_1");
      expect(state?.name).toBe("Pertama");
      expect(state?.version).toBe(2);
    });
  });

  describe("negatif — validasi current state sebelum commit (INV-LIFE-003, INV-LIFE-004)", () => {
    it("updateProjectName pada Project ARCHIVED ditolak (INV-LIFE-003)", async () => {
      await seedProject("proj_1", { archivedAt: T0, version: 2 });
      await expect(
        repo.updateProjectName({ projectId: "proj_1", expectedVersion: 2, actorUserId: OWNER, name: "X" }),
      ).rejects.toBeInstanceOf(ProjectInvalidStateError);
      expect(await activityCount()).toBe(0);
      const state = await repo.getProjectState("proj_1");
      expect(state?.name).toBe("Alpha");
    });

    it("updateProjectName pada Project DELETED ditolak (INV-LIFE-004)", async () => {
      await seedProject("proj_1", { deletedAt: T0, version: 2 });
      await expect(
        repo.updateProjectName({ projectId: "proj_1", expectedVersion: 2, actorUserId: OWNER, name: "X" }),
      ).rejects.toBeInstanceOf(ProjectInvalidStateError);
    });

    it("archive pada Project DELETED ditolak (INV-LIFE-004)", async () => {
      await seedProject("proj_1", { archivedAt: T0, deletedAt: T0, version: 3 });
      await expect(
        repo.archiveProject({ projectId: "proj_1", expectedVersion: 3, actorUserId: OWNER }),
      ).rejects.toBeInstanceOf(ProjectInvalidStateError);
      expect(await activityCount()).toBe(0);
    });

    it("restore pada Project DELETED ditolak — DELETED terminal (INV-LIFE-004)", async () => {
      await seedProject("proj_1", { deletedAt: T0, version: 2 });
      await expect(
        repo.restoreProject({ projectId: "proj_1", expectedVersion: 2, actorUserId: OWNER }),
      ).rejects.toBeInstanceOf(ProjectInvalidStateError);
      const state = await repo.getProjectState("proj_1");
      expect(state?.deletedAt).toBe(T0);
      expect(await activityCount()).toBe(0);
    });

    it("restore pada Project ACTIVE bukan transisi valid (state machine A.3)", async () => {
      await seedProject("proj_1");
      await expect(
        repo.restoreProject({ projectId: "proj_1", expectedVersion: 1, actorUserId: OWNER }),
      ).rejects.toBeInstanceOf(ProjectInvalidStateError);
    });

    it("delete pada Project DELETED ditolak — tidak ada double-delete (INV-LIFE-004)", async () => {
      await seedProject("proj_1", { deletedAt: T0, version: 2 });
      await expect(
        repo.deleteProject({ projectId: "proj_1", expectedVersion: 2, actorUserId: OWNER }),
      ).rejects.toBeInstanceOf(ProjectInvalidStateError);
    });
  });

  describe("error lain", () => {
    it("command pada Project yang tidak ada → RESOURCE_NOT_FOUND tanpa Activity (BR-007 boundary)", async () => {
      await expect(
        repo.updateProjectName({ projectId: "proj_hilang", expectedVersion: 1, actorUserId: OWNER, name: "X" }),
      ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
      await expect(repo.archiveProject({ projectId: "proj_hilang", expectedVersion: 1, actorUserId: OWNER })).rejects.toBeInstanceOf(
        ProjectNotFoundError,
      );
      expect(await activityCount()).toBe(0);
    });
  });
});
