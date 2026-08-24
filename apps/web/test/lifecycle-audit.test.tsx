// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  LifecycleAuditView,
} from "../src/components/kanban/lifecycle-audit-view";
import { selectLifecycleEvents } from "../src/features/lifecycle/audit";
import type { ActivityEntry } from "../src/features/activity/hooks";
import { queryClient } from "../src/lib/query-client";

const mocks = vi.hoisted(() => ({ useLifecycleAudit: vi.fn() }));
vi.mock("../src/features/lifecycle/audit", async (orig) => {
  const mod = await orig<typeof import("../src/features/lifecycle/audit")>();
  return { ...mod, useLifecycleAudit: mocks.useLifecycleAudit };
});

function entry(partial: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: "a1",
    entityType: "board",
    entityId: "01HX8Q7M2N3P4R5S6TUVWXYZAB",
    entityVersion: 3,
    actorUserId: "01JAAAAAAAAAAAAAAAAAAAAAAA",
    action: "board.archived",
    data: { previousState: "ACTIVE" },
    createdAt: "2026-08-25T08:00:00.000Z",
    ...partial,
  };
}

function idle(data?: { activities: ActivityEntry[] }) {
  return { data, isLoading: false } as never;
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  for (const fn of Object.values(mocks)) fn.mockReset();
});

describe("TASK-7.13.4 — Archived/Deleted Audit view read-only", () => {
  test("positif: selectLifecycleEvents hanya mengambil .archived/.deleted, urut terbaru dulu", () => {
    const rows = selectLifecycleEvents({
      activities: [
        entry({ id: "1", action: "card.created", createdAt: "2026-08-20T08:00:00.000Z" }),
        entry({ id: "2", action: "list.archived", entityType: "list", createdAt: "2026-08-21T08:00:00.000Z" }),
        entry({ id: "3", action: "card.moved" }),
        entry({ id: "4", action: "board.deleted", createdAt: "2026-08-23T08:00:00.000Z" }),
        entry({ id: "5", action: "board.restored", createdAt: "2026-08-24T08:00:00.000Z" }),
        entry({ id: "6", action: "card.deleted", entityType: "card", createdAt: "2026-08-25T08:00:00.000Z" }),
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(["6", "4", "2"]);
  });

  test("negatif: selectLifecycleEvents pada undefined → array kosong tanpa crash", () => {
    expect(selectLifecycleEvents(undefined)).toEqual([]);
  });

  test("positif: view merender baris audit read-only (waktu/aksi/entity/aktor)", () => {
    mocks.useLifecycleAudit.mockReturnValue(
      idle([entry({ id: "9", action: "list.archived", entityType: "list" })]),
    );
    render(
      <QueryClientProvider client={queryClient}>
        <LifecycleAuditView projectId="p1" />
      </QueryClientProvider>,
    );
    expect(screen.getByText("list.archived")).toBeTruthy();
    expect(screen.getByLabelText("Audit arsip dan hapus")).toBeTruthy();
    const row = screen.getByText("list.archived").closest("tr");
    expect(row?.textContent).toContain("list");
    expect(row?.textContent).toContain("WXYZAB");
  });

  test("negatif: TIDAK ada tombol/mutasi apa pun di audit view", () => {
    mocks.useLifecycleAudit.mockReturnValue(idle([entry()]));
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <LifecycleAuditView projectId="p1" />
      </QueryClientProvider>,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  test("kosong & tanpa context → state netral", () => {
    mocks.useLifecycleAudit.mockReturnValue(idle(undefined));
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <LifecycleAuditView projectId="p1" />
      </QueryClientProvider>,
    );
    expect(container.textContent).toContain("Belum ada event");
    cleanup();
    mocks.useLifecycleAudit.mockReturnValue(idle(undefined));
    render(
      <QueryClientProvider client={queryClient}>
        <LifecycleAuditView projectId={undefined} />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/Pilih Project/)).toBeTruthy();
  });
});
