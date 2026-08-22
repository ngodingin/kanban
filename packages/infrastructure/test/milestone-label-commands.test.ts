import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  AncestorNotActiveError,
  LabelInvalidStateError,
  LabelNotFoundError,
  LabelValidationError,
  LabelVersionConflictError,
} from "@kanban/domain";
import { DrizzleMilestoneLabelRepository } from "../src/database/milestone-label-repository.ts";
import { createTestProjectDb, type TestDb } from "./helpers/db.ts";

const T0 = "2026-08-01T00:00:00.000Z";
const PROJECT = "proj_1";
const OWNER = "user_owner_1";

let db: TestDb;
let repo: DrizzleMilestoneLabelRepository;

async function seedChain(opts: { milestoneArchivedAt?: string | null; projectArchivedAt?: string | null } = {}): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO project_state (project_id, name, created_at, updated_at, archived_at, version) VALUES (?, ?, ?, ?, ?, 1)",
    args: [PROJECT, "Alpha", T0, T0, opts.projectArchivedAt ?? null],
  });
  await db.client.execute({
    sql: "INSERT INTO milestones (id, title, description, progress, created_at, updated_at, archived_at, version) VALUES ('ms_l', 'M', NULL, 0, ?, ?, ?, 1)",
    args: [T0, T0, opts.milestoneArchivedAt ?? null],
  });
}

async function seedLabel(id: string, opts: { archivedAt?: string | null; deletedAt?: string | null; name?: string } = {}): Promise<void> {
  await db.client.execute({
    sql: "INSERT INTO milestone_labels (id, milestone_id, name, created_at, updated_at, archived_at, deleted_at, version) VALUES (?, 'ms_l', ?, ?, ?, ?, ?, 1)",
    args: [id, opts.name ?? `L ${id}`, T0, T0, opts.archivedAt ?? null, opts.deletedAt ?? null],
  });
}

async function labelActivities(labelId?: string): Promise<Array<{ entity_type: string; action: string; data: string }>> {
  const r = labelId
    ? await project_client_query("SELECT entity_type, action, data FROM activities WHERE entity_id = ?", [labelId])
    : await project_client_query("SELECT entity_type, action, data FROM activities");
  return r.rows.map((row) => ({
    entity_type: String(row.entity_type),
    action: String(row.action),
    data: String(row.data),
  }));
}

function project_client_query(sql: string, args: unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
  return db.client.execute({ sql, args: args as never[] }) as Promise<{ rows: Record<string, unknown>[] }>;
}

beforeAll(async () => {
  db = await createTestProjectDb();
  repo = new DrizzleMilestoneLabelRepository(db.client);
});

afterEach(async () => {
  await db.truncateAll();
});

afterAll(async () => {
  await db.cleanup();
});

describe("Milestone Label domain commands — C.11/INV-LIFE (goal 3.3.1)", () => {
  it("[FR-031][positif] create pada chain ACTIVE → version 1 + Activity entity_type milestone_label", async () => {
    await seedChain();
    const created = await repo.createMilestoneLabel(PROJECT, "ms_l", {
      id: "ml_new",
      name: "Bug",
      actorUserId: OWNER,
    });
    expect(created).toMatchObject({ id: "ml_new", milestoneId: "ms_l", name: "Bug", version: 1 });
    const [activity] = await labelActivities("ml_new");
    expect(activity!.entity_type).toBe("milestone_label"); // bukan 'milestone'
    expect(activity!.action).toBe("milestone_label.created");
    expect(JSON.parse(activity!.data)).toEqual({ snapshot: { name: "Bug" } });
  });

  it("[list] exclude deleted by default; includeDeleted menampilkan semua", async () => {
    await seedChain();
    await seedLabel("ml_a");
    await seedLabel("ml_b", { deletedAt: T0 });
    expect((await repo.listMilestoneLabels(PROJECT, "ms_l")).map((l) => l.id)).toEqual(["ml_a"]);
    expect((await repo.listMilestoneLabels(PROJECT, "ms_l", { includeDeleted: true })).map((l) => l.id)).toEqual([
      "ml_a",
      "ml_b",
    ]);
  });

  it("[Review-CL-02][WAJIB] archive Milestone dulu → update/archive/delete Label local-ACTIVE DITOLAK semua", async () => {
    await seedChain();
    await seedLabel("ml_r2");
    // archive Milestone lewat repository Phase 2
    const milestoneRepo = new (await import("../src/database/milestone-repository.ts")).DrizzleMilestoneRepository(
      db.client,
    );
    await milestoneRepo.archiveMilestone(PROJECT, { milestoneId: "ms_l", expectedVersion: 1, actorUserId: OWNER });

    await expect(
      repo.updateMilestoneLabel(PROJECT, { labelId: "ml_r2", expectedVersion: 1, actorUserId: OWNER, name: "X" }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
    await expect(
      repo.archiveMilestoneLabel(PROJECT, { labelId: "ml_r2", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
    await expect(
      repo.deleteMilestoneLabel(PROJECT, { labelId: "ml_r2", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);

    const row = await project_client_query("SELECT name, version FROM milestone_labels WHERE id = 'ml_r2'", []);
    expect(row.rows[0]).toMatchObject({ name: "L ml_r2", version: 1 });
    const labelActs = await db.client.execute(
      "SELECT COUNT(*) AS n FROM activities WHERE entity_type = 'milestone_label'",
    );
    expect(Number(labelActs.rows[0]?.n)).toBe(0); // tidak ada activity Label
    const msActs = await db.client.execute(
      "SELECT COUNT(*) AS n FROM activities WHERE entity_type = 'milestone' AND action = 'milestone.archived'",
    );
    expect(Number(msActs.rows[0]?.n)).toBe(1); // hanya archive Milestone itu sendiri
  });

  it("[INV-LIFE-001] negatif: Project ARCHIVED walau Milestone ACTIVE → create ditolak", async () => {
    await seedChain({ projectArchivedAt: T0 });
    await expect(
      repo.createMilestoneLabel(PROJECT, "ms_l", { id: "ml_x", name: "X", actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
  });

  it("[A.3] update dari ARCHIVED ditolak; delete dari DELETED ditolak (terminal)", async () => {
    await seedChain();
    await seedLabel("ml_ar", { archivedAt: T0 });
    await expect(
      repo.updateMilestoneLabel(PROJECT, { labelId: "ml_ar", expectedVersion: 1, actorUserId: OWNER, name: "Gagal" }),
    ).rejects.toBeInstanceOf(LabelInvalidStateError);

    await seedLabel("ml_de", { deletedAt: T0 });
    await expect(
      repo.deleteMilestoneLabel(PROJECT, { labelId: "ml_de", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(LabelInvalidStateError);
  });

  it("[AC-020] expected_version salah → VERSION_CONFLICT tanpa perubahan/activity", async () => {
    await seedChain();
    await seedLabel("ml_v");
    await expect(
      repo.updateMilestoneLabel(PROJECT, { labelId: "ml_v", expectedVersion: 99, actorUserId: OWNER, name: "Tabrak" }),
    ).rejects.toBeInstanceOf(LabelVersionConflictError);
    const row = await project_client_query("SELECT name, version FROM milestone_labels WHERE id = 'ml_v'", []);
    expect(row.rows[0]).toMatchObject({ name: "L ml_v", version: 1 });
    expect(await labelActivities()).toHaveLength(0);
  });

  it("[INV-LIFE-002] restore ARCHIVED saat ancestor ACTIVE → sukses; saat Project ARCHIVED → ditolak", async () => {
    await seedChain();
    await seedLabel("ml_ok", { archivedAt: T0 });
    const restored = await repo.restoreMilestoneLabel(PROJECT, {
      labelId: "ml_ok",
      expectedVersion: 1,
      actorUserId: OWNER,
    });
    expect(restored.archivedAt).toBeNull();
    const [activity] = await labelActivities("ml_ok");
    expect(activity!.action).toBe("milestone_label.restored");

    await db.truncateAll();
    await seedChain({ projectArchivedAt: T0 });
    await seedLabel("ml_blk", { archivedAt: T0 });
    await expect(
      repo.restoreMilestoneLabel(PROJECT, { labelId: "ml_blk", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(AncestorNotActiveError);
  });

  it("[B.5] archive/delete menyimpan previous_state; patch kosong → VALIDATION_ERROR; label tidak ada → NOT_FOUND", async () => {
    await seedChain();
    await seedLabel("ml_ad");
    await repo.archiveMilestoneLabel(PROJECT, { labelId: "ml_ad", expectedVersion: 1, actorUserId: OWNER });
    const all = await labelActivities("ml_ad");
    expect(all).toHaveLength(1); // hanya archived — label di-seed langsung, bukan via create
    expect(all[0]!.action).toBe("milestone_label.archived");
    expect(JSON.parse(all[0]!.data)).toEqual({ previous_state: "ACTIVE" });

    await seedLabel("ml_e");
    await expect(
      repo.updateMilestoneLabel(PROJECT, { labelId: "ml_e", expectedVersion: 1, actorUserId: OWNER, name: "L ml_e" }),
    ).rejects.toBeInstanceOf(LabelValidationError);

    await expect(
      repo.archiveMilestoneLabel(PROJECT, { labelId: "ml_none", expectedVersion: 1, actorUserId: OWNER }),
    ).rejects.toBeInstanceOf(LabelNotFoundError);
  });
});
