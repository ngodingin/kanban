import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  AncestorNotActiveError,
  MilestoneInvalidStateError,
  MilestoneNotFoundError,
  MilestoneValidationError,
  MilestoneVersionConflictError,
} from "@kanban/domain";
import { DrizzleMilestoneRepository } from "../src/database/milestone-repository.ts";
import { DrizzleProjectRepository } from "../src/database/project-repository.ts";
import { createTestProjectDb, type TestDb } from "./helpers/db.ts";

const T0 = "2026-08-01T00:00:00.000Z";
const PROJECT = "proj_1";
const OWNER = "user_owner_1";

let db: TestDb;
let repo: DrizzleMilestoneRepository;

async function seedProject(
  id: string = PROJECT,
  opts: { name?: string; archivedAt?: string | null; deletedAt?: string | null; version?: number } = {},
): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [id, opts.name ?? "Alpha", T0, T0, opts.archivedAt ?? null, opts.deletedAt ?? null, opts.version ?? 1],
  });
}

interface SeedMilestoneOpts {
  archivedAt?: string | null;
  deletedAt?: string | null;
  progress?: number;
}

async function seedMilestone(id: string, opts: SeedMilestoneOpts = {}): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, start_date, due_date, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
    args: [id, `MS ${id}`, null, opts.progress ?? 0, null, null, T0, T0, opts.archivedAt ?? null, opts.deletedAt ?? null],
  });
}

interface ActivityRow {
  entity_type: string;
  entity_id: string;
  entity_version: number;
  actor_user_id: string;
  action: string;
  data: string;
}

async function listActivities(entityId?: string): Promise<ActivityRow[]> {
  const r = entityId
    ? await db.client.execute({ sql: "SELECT * FROM activities WHERE entity_id = ?", args: [entityId] })
    : await db.client.execute("SELECT * FROM activities");
  return r.rows.map((row) => ({
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
  repo = new DrizzleMilestoneRepository(db.client);
});

afterEach(async () => {
  await db.truncateAll();
});

afterAll(async () => {
  await db.cleanup();
});

describe("createMilestone — BR-013/INV-LIFE-001/FR-014 (goal 2.2.1)", () => {
  it("[INV-LIFE-001] positif: Project ACTIVE → milestone dibuat dengan version 1 + Activity milestone.created", async () => {
    await seedProject();
    const created = await repo.createMilestone(PROJECT, {
      id: "ms_new",
      title: "MVP",
      description: "deskripsi",
      progress: 40,
      startDate: "2026-08-17",
      dueDate: "2026-09-30",
      actorUserId: OWNER,
    });
    expect(created.version).toBe(1);
    expect(created.title).toBe("MVP");
    expect(created.progress).toBe(40);
    const activities = await listActivities("ms_new");
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      entity_type: "milestone",
      action: "milestone.created",
      entity_version: 1,
      actor_user_id: OWNER,
    });
    expect(JSON.parse(activities[0]!.data)).toEqual({ snapshot: { title: "MVP", progress: 40 } });
  });

  it("[BR-013] negatif: Project ARCHIVED → create ditolak AncestorNotActiveError tanpa row/activity", async () => {
    await seedProject(PROJECT, { archivedAt: T0 });
    await expect(
      repo.createMilestone(PROJECT, {
        id: "ms_x",
        title: "X",
        description: null,
        progress: 0,
        startDate: null,
        dueDate: null,
        actorUserId: OWNER,
      }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
    const rows = await db.client.execute("SELECT COUNT(*) AS n FROM milestones");
    expect(Number(rows.rows[0]?.n)).toBe(0);
    expect(await listActivities()).toHaveLength(0);
  });

  it("[INV-LIFE-001] negatif: Project DELETED → create ditolak", async () => {
    await seedProject(PROJECT, { deletedAt: T0 });
    await expect(
      repo.createMilestone(PROJECT, {
        id: "ms_x",
        title: "X",
        description: null,
        progress: 0,
        startDate: null,
        dueDate: null,
        actorUserId: OWNER,
      }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
  });

  it("[FR-014] negatif: progress di luar 0–100 ditolak VALIDATION_ERROR", async () => {
    await seedProject();
    for (const bad of [-1, 101, 2.5]) {
      await expect(
        repo.createMilestone(PROJECT, {
          id: "ms_p",
          title: "P",
          description: null,
          progress: bad,
          startDate: null,
          dueDate: null,
          actorUserId: OWNER,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
  });

  it("[FR-014] negatif: title kosong ditolak VALIDATION_ERROR", async () => {
    await seedProject();
    await expect(
      repo.createMilestone(PROJECT, {
        id: "ms_t",
        title: "   ",
        description: null,
        progress: 0,
        startDate: null,
        dueDate: null,
        actorUserId: OWNER,
      }),
    ).rejects.toBeInstanceOf(MilestoneValidationError);
  });
});

describe("updateMilestone — AC-020/A.3/B.5 (goal 2.2.1)", () => {
  it("positif: update dari ACTIVE mengubah field + Activity changes {before, after}", async () => {
    await seedProject();
    await seedMilestone("ms_u", { progress: 10 });
    const updated = await repo.updateMilestone(PROJECT, {
      milestoneId: "ms_u",
      expectedVersion: 1,
      actorUserId: OWNER,
      title: "Baru",
      progress: 55,
    });
    expect(updated).toMatchObject({ title: "Baru", progress: 55, version: 2 });
    const [activity] = await listActivities("ms_u");
    expect(activity!.action).toBe("milestone.updated");
    expect(activity!.entity_version).toBe(2);
    expect(JSON.parse(activity!.data)).toEqual({
      changes: {
        title: { before: "MS ms_u", after: "Baru" },
        progress: { before: 10, after: 55 },
      },
    });
  });

  it("negatif: update dari ARCHIVED ditolak (A.3 update:[ACTIVE], INV-LIFE-003)", async () => {
    await seedProject();
    await seedMilestone("ms_a", { archivedAt: T0 });
    await expect(
      repo.updateMilestone(PROJECT, {
        milestoneId: "ms_a",
        expectedVersion: 1,
        actorUserId: OWNER,
        title: "Gagal",
      }),
    ).rejects.toBeInstanceOf(MilestoneInvalidStateError);
  });

  it("negatif: expectedVersion salah → VERSION_CONFLICT tanpa perubahan maupun Activity (AC-020)", async () => {
    await seedProject();
    await seedMilestone("ms_v");
    await expect(
      repo.updateMilestone(PROJECT, {
        milestoneId: "ms_v",
        expectedVersion: 99,
        actorUserId: OWNER,
        title: "Tidak boleh",
      }),
    ).rejects.toBeInstanceOf(MilestoneVersionConflictError);
    const row = await db.client.execute("SELECT title, version FROM milestones WHERE id = 'ms_v'");
    expect(row.rows[0]).toMatchObject({ title: "MS ms_v", version: 1 });
    expect(await listActivities()).toHaveLength(0);
  });

  it("negatif: milestone tidak ada → RESOURCE_NOT_FOUND", async () => {
    await seedProject();
    await expect(
      repo.updateMilestone(PROJECT, {
        milestoneId: "ms_none",
        expectedVersion: 1,
        actorUserId: OWNER,
        title: "X",
      }),
    ).rejects.toBeInstanceOf(MilestoneNotFoundError);
  });

  it("[Review-CL-02][INV-LIFE-001] negatif: Project di-archive lalu update/archive/delete Milestone (local ACTIVE) → DITOLAK semua", async () => {
    await seedProject();
    await seedMilestone("ms_rev");
    // archive Project lewat repository Phase 1
    const projectRepo = new DrizzleProjectRepository(db.client);
    await projectRepo.archiveProject({ projectId: PROJECT, expectedVersion: 1, actorUserId: OWNER });

    await expect(
      repo.updateMilestone(PROJECT, {
        milestoneId: "ms_rev",
        expectedVersion: 1,
        actorUserId: OWNER,
        title: "Gagal",
      }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
    await expect(
      repo.archiveMilestone(PROJECT, { milestoneId: "ms_rev", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
    await expect(
      repo.deleteMilestone(PROJECT, { milestoneId: "ms_rev", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);

    const row = await db.client.execute("SELECT title, version, archived_at FROM milestones WHERE id = 'ms_rev'");
    expect(row.rows[0]).toMatchObject({ title: "MS ms_rev", version: 1, archived_at: null });
    const msActivities = await db.client.execute(
      "SELECT COUNT(*) AS n FROM activities WHERE entity_type = 'milestone'",
    );
    expect(Number(msActivities.rows[0]?.n)).toBe(0);
  });

  it("negatif: patch kosong (tanpa perubahan) → VALIDATION_ERROR", async () => {
    await seedProject();
    await seedMilestone("ms_e");
    await expect(
      repo.updateMilestone(PROJECT, {
        milestoneId: "ms_e",
        expectedVersion: 1,
        actorUserId: OWNER,
        title: "MS ms_e",
      }),
    ).rejects.toBeInstanceOf(MilestoneValidationError);
  });
});

describe("archive/restore/delete — state machine A.3 (goal 2.2.1)", () => {
  it("positif: archive ACTIVE → archivedAt terisi + Activity previous_state ACTIVE", async () => {
    await seedProject();
    await seedMilestone("ms_arc");
    const archived = await repo.archiveMilestone(PROJECT, {
      milestoneId: "ms_arc",
      expectedVersion: 1,
      actorUserId: OWNER,
    });
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.deletedAt).toBeNull();
    const [activity] = await listActivities("ms_arc");
    expect(activity!.action).toBe("milestone.archived");
    expect(JSON.parse(activity!.data)).toEqual({ previous_state: "ACTIVE" });
  });

  it("[A.3] negatif: archive dari ARCHIVED ditolak; delete dari DELETED ditolak (terminal)", async () => {
    await seedProject();
    await seedMilestone("ms_ar", { archivedAt: T0 });
    await expect(
      repo.archiveMilestone(PROJECT, { milestoneId: "ms_ar", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(MilestoneInvalidStateError);

    await seedMilestone("ms_del", { deletedAt: T0 });
    await expect(
      repo.deleteMilestone(PROJECT, { milestoneId: "ms_del", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(MilestoneInvalidStateError);
  });

  it("[INV-LIFE-002] negatif: restore ARCHIVED saat Project ARCHIVED ditolak — urutan benar: pulihkan Project dulu", async () => {
    await seedProject(PROJECT, { archivedAt: T0 });
    await seedMilestone("ms_r", { archivedAt: T0 });
    await expect(
      repo.restoreMilestone(PROJECT, { milestoneId: "ms_r", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
    // row tidak berubah — restore ditolak sebelum UPDATE
    const row = await db.client.execute("SELECT archived_at, version FROM milestones WHERE id = 'ms_r'");
    expect(row.rows[0]).toMatchObject({ archived_at: T0, version: 1 });
  });

  it("[INV-LIFE-002] positif: restore ARCHIVED saat Project ACTIVE → archivedAt null + Activity previous_state ARCHIVED", async () => {
    await seedProject();
    await seedMilestone("ms_ok", { archivedAt: T0 });
    const restored = await repo.restoreMilestone(PROJECT, {
      milestoneId: "ms_ok",
      expectedVersion: 1,
      actorUserId: OWNER,
    });
    expect(restored.archivedAt).toBeNull();
    expect(restored.version).toBe(2);
    const [activity] = await listActivities("ms_ok");
    expect(activity!.action).toBe("milestone.restored");
    expect(JSON.parse(activity!.data)).toEqual({ previous_state: "ARCHIVED" });
  });

  it("[INV-LIFE-004] negatif: restore entity DELETED selalu ditolak walau ancestor ACTIVE", async () => {
    await seedProject();
    await seedMilestone("ms_dead", { deletedAt: T0 });
    await expect(
      repo.restoreMilestone(PROJECT, { milestoneId: "ms_dead", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(MilestoneInvalidStateError);
  });

  it("positif: delete dari ARCHIVED diizinkan (delete:[ACTIVE|ARCHIVED]) + previous_state ARCHIVED; mutation+activity atomik", async () => {
    await seedProject();
    await seedMilestone("ms_d", { archivedAt: T0 });
    const deleted = await repo.deleteMilestone(PROJECT, {
      milestoneId: "ms_d",
      expectedVersion: 1,
      actorUserId: OWNER,
    });
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.archivedAt).not.toBeNull(); // BR-013 — archived_at tidak disentuh delete
    const [activity] = await listActivities("ms_d");
    expect(JSON.parse(activity!.data)).toEqual({ previous_state: "ARCHIVED" });
    expect(activity!.entity_version).toBe(2);
  });
});
