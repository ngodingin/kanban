// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ActivityTimeline,
} from "../src/components/kanban/activity-timeline";
import { groupByDay, type ActivityEntry } from "../src/features/activity/hooks";
import { queryClient } from "../src/lib/query-client";

const mocks = vi.hoisted(() => ({ useActivities: vi.fn() }));
vi.mock("../src/features/activity/hooks", async (orig) => {
  const mod = await orig<typeof import("../src/features/activity/hooks")>();
  return { ...mod, useActivities: mocks.useActivities };
});

function idle(data?: { activities: ActivityEntry[] }) {
  return { data, isLoading: false } as never;
}

const NOW = new Date(2026, 7, 25, 10, 0); // lokal — hindari ambiguitas zona waktu

function entry(partial: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: "a1",
    entityType: "card",
    entityId: "c1",
    entityVersion: 2,
    actorUserId: "u1",
    action: "card.created",
    data: {},
    createdAt: NOW.toISOString(),
    ...partial,
  };
}

afterEach(() => {
  cleanup();
  for (const fn of Object.values(mocks)) fn.mockReset();
});

describe("TASK-7.8.1 — timeline historis grouped by day/time (audit)", () => {
  test("positif: grup per hari (Hari ini/Kemarin/tanggal) + urutan waktu menurun", () => {
    const groups = groupByDay(
      [
        entry({ id: "a1", createdAt: new Date(2026, 7, 25, 8, 30).toISOString() }),
        entry({ id: "a2", createdAt: new Date(2026, 7, 25, 9, 15).toISOString() }),
        entry({
          id: "a3",
          action: "card.moved",
          createdAt: new Date(2026, 7, 24, 21, 0).toISOString(),
        }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.dayLabel)).toEqual(["Hari ini", "Kemarin"]);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(["a2", "a1"]);
    expect(groups[0]!.entries[0]!.timeLabel).toBeTruthy();
  });

  test("positif: timeline read-only merender aksi + tipe entity + waktu", () => {
    mocks.useActivities.mockReturnValue(
      idle({
        activities: [entry({ action: "board.archived", entityType: "board" })],
      }),
    );
    render(
      <QueryClientProvider client={queryClient}>
        <ActivityTimeline projectId="p1" />
      </QueryClientProvider>,
    );
    expect(screen.getByText("board.archived")).toBeTruthy();
    expect(screen.getByText("(board)")).toBeTruthy();
    expect(screen.getByLabelText("Activity timeline")).toBeTruthy();
  });

  test("negatif: TIDAK ada kontrol mutasi (edit/delete/mark-read) dan bukan feed notifikasi", () => {
    mocks.useActivities.mockReturnValue(idle({ activities: [entry()] }));
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ActivityTimeline projectId="p1" />
      </QueryClientProvider>,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/delete|edit|archive|restore|mark as read|unread/i);
  });

  test("tanpa context project → pesan netral, tanpa fetch", () => {
    mocks.useActivities.mockReturnValue(idle(undefined));
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ActivityTimeline projectId={undefined} />
      </QueryClientProvider>,
    );
    expect(container.textContent).toContain("Pilih Project");
    expect(mocks.useActivities).toHaveBeenCalledWith(undefined);
  });
});
