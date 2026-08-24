// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { YourWorkPanel } from "../src/features/home/your-work-panel";
import { bucketFor } from "../src/features/home/your-work";
import { queryClient } from "../src/lib/query-client";

const NOW = new Date(2026, 7, 25, 12, 0);

function card(partial: Record<string, unknown>) {
  return {
    id: "c1",
    title: "T",
    projectId: "p1",
    listId: "l1",
    assigneeUserId: null,
    archivedAt: null,
    deletedAt: null,
    dueDate: null,
    ...partial,
  };
}

function stubHierarchy(cards: Array<Record<string, unknown>>, projectIds = ["p1", "p2"]) {
  return vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    const pid = u.includes("/projects/p1") ? "p1" : "p2";
    if (u.endsWith("/milestones")) {
      return Promise.resolve(jsonRes(200, { data: { milestones: [{ id: `${pid}-m1` }] } }));
    }
    if (u.endsWith("/boards")) {
      return Promise.resolve(jsonRes(200, { data: { boards: [{ id: `${pid}-b1` }] } }));
    }
    if (u.endsWith("/lists")) {
      return Promise.resolve(jsonRes(200, { data: { lists: [{ id: `${pid}-l1` }] } }));
    }
    if (u.endsWith("/cards")) {
      return Promise.resolve(
        jsonRes(200, {
          data: {
            cards: pid === "p1" ? cards : [],
          },
        }),
      );
    }
    void projectIds;
    return Promise.reject(new Error(`unexpected ${u}`));
  });
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("TASK-7.4.1 — panel Your work (My Tasks / Due soon / Overdue)", () => {
  test("positif: bucketFor — milik saya + due logic; arsip/hapus dikecualikan; bukan milik saya → null", () => {
    const me = "user-ME0001";
    expect(bucketFor(card({}), me, NOW)).toBeNull(); // tanpa assignee
    expect(bucketFor(card({ assigneeUserId: "user-OTHER" }), me, NOW)).toBeNull();
    expect(bucketFor(card({ assigneeUserId: me }), me, NOW)).toBe("myTasks");
    expect(
      bucketFor(card({ assigneeUserId: me, dueDate: "2026-08-28T00:00:00.000Z" }), me, NOW),
    ).toBe("dueSoon");
    expect(
      bucketFor(card({ assigneeUserId: me, dueDate: "2026-08-20T00:00:00.000Z" }), me, NOW),
    ).toBe("overdue");
    // Negatif: arsip/hapus tidak masuk bucket apa pun.
    expect(
      bucketFor(card({ assigneeUserId: me, archivedAt: "2026-08-01T00:00:00.000Z" }), me, NOW),
    ).toBeNull();
    expect(
      bucketFor(card({ assigneeUserId: me, deletedAt: "2026-08-01T00:00:00.000Z" }), me, NOW),
    ).toBeNull();
  });

  test("positif: agregasi lintas Project via endpoint Project-scoped (walk hierarki)", async () => {
    const fetchMock = stubHierarchy([
      card({ id: "c-overdue", title: "Terlambat", assigneeUserId: "user-ME0001", dueDate: "2026-08-01T00:00:00.000Z" }),
      card({ id: "c-soon", title: "Segera", assigneeUserId: "user-ME0001", dueDate: "2026-08-28T00:00:00.000Z" }),
      card({ id: "c-mine", title: "Milikku", assigneeUserId: "user-ME0001" }),
      card({ id: "c-other", title: "Orang lain", assigneeUserId: "user-OTHER" }),
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <YourWorkPanel projectIds={["p1", "p2"]} currentUserId="user-ME0001" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Terlambat")).toBeTruthy());
    expect(screen.getByText("Segera")).toBeTruthy();
    expect(screen.getByText("Milikku")).toBeTruthy();
    // Negatif: kartu orang lain tidak muncul di panel mana pun.
    expect(screen.queryByText("Orang lain")).toBeNull();

    // Negatif inti BR-010: seluruh request adalah Project-scoped.
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toMatch(/^\/api\/v1\/projects\/[^/]+\/(milestones|boards|lists|cards)/);
    }
  });

  test("negatif: tanpa userId → panel kosong tapi tetap merender tiga bucket", async () => {
    vi.stubGlobal("fetch", stubHierarchy([card({})]));
    render(
      <QueryClientProvider client={queryClient}>
        <YourWorkPanel projectIds={["p1"]} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByText("—")).toHaveLength(3));
    expect(screen.getByLabelText("Your work")).toBeTruthy();
  });

  test("negatif: bukan admin panel — tanpa revenue/charts", () => {
    vi.stubGlobal("fetch", stubHierarchy([]));
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <YourWorkPanel projectIds={[]} />
      </QueryClientProvider>,
    );
    expect(container.textContent).not.toMatch(/revenue|chart|analytics/i);
    expect(container.querySelector("canvas, svg[class*=chart]")).toBeNull();
  });
});
