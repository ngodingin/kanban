import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { applyProjectMigrations } from "@kanban/infrastructure";
import { addComment, editComment } from "../src/database/card-comment.ts";
import { listActivities } from "../src/database/activity-query.ts";
import { DrizzleCardRepository } from "../src/database/card-repository.ts";

const BASE = "2026-01-01T00:00:00.000Z";

let dir: string;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ac012-comment-"));
  client = createClient({ url: `file:${join(dir, "proj.db")}` });
  await applyProjectMigrations(client);
  const seeds: Array<[sql: string, args: string[]]> = [
    ["INSERT INTO project_state (project_id, name, created_at, updated_at, version) VALUES ('p1', 'P', ?, ?, 1)", [BASE, BASE]],
    ["INSERT INTO milestones (id, title, progress, created_at, updated_at, version) VALUES ('ms-c', 'M', 0, ?, ?, 1)", [BASE, BASE]],
    ["INSERT INTO boards (id, milestone_id, title, created_at, updated_at, version) VALUES ('bd-c', 'ms-c', 'B', ?, ?, 1)", [BASE, BASE]],
    ["INSERT INTO lists (id, board_id, title, created_at, updated_at, version) VALUES ('ls-c', 'bd-c', 'L', ?, ?, 1)", [BASE, BASE]],
    ["INSERT INTO cards (id, list_id, creator_user_id, title, created_at, updated_at, version) VALUES ('cd-c', 'ls-c', 'u', 'T', ?, ?, 1)", [BASE, BASE]],
  ];
  for (const [sql, args] of seeds) {
    await client.execute({ sql, args });
  }
});

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("AC-012 — Comment historis tetap terbaca via read-path activities setelah Card DELETED (goal 6.8.3)", () => {
  it("[AC-012] comment.added + comment.edited tetap terbaca setelah deleteCard terminal — tidak ikut hilang/tersembunyi", async () => {
    // Comment dibuat via jalur domain ASLI (bukan INSERT manual) selama Card masih ACTIVE
    const added = await addComment(client, "cd-c", "versi awal", "u");
    await editComment(client, "cd-c", added.id, "versi edit", "u");

    // Delete GENUINE via domain command terminal (bukan UPDATE deleted_at manual)
    const repo = new DrizzleCardRepository(client, { assertAssigneeActiveMember: async () => undefined });
    const deleted = await repo.deleteCard("p1", { cardId: "cd-c", expectedVersion: 1, actorUserId: "u" });
    expect(deleted.deletedAt).not.toBeNull();

    // Verifikasi lewat read-path yang dipakai GET /activities
    const acts = await listActivities(client, { entityType: "card", entityId: "cd-c" });
    const actions = acts.map((a) => a.action);

    // Delete benar-benar tereksekusi (guard anti false-positive seperti QA-CL-18)
    expect(actions).toContain("card.deleted");

    // Inti AC-012: comment historis TETAP terbaca setelah Card DELETED
    const comments = acts.filter((a) => a.action === "comment.added" || a.action === "comment.edited");
    expect(comments.map((c) => c.action)).toEqual(["comment.added", "comment.edited"]);

    // Immutability: body versi awal di comment.added TIDAK tertimpa oleh edit
    const addedRow = comments.find((c) => c.action === "comment.added")!;
    const editedRow = comments.find((c) => c.action === "comment.edited")!;
    expect((addedRow.data as { body: string }).body).toBe("versi awal");
    expect((editedRow.data as { after: string }).after).toBe("versi edit");  });
});
