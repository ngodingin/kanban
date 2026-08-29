// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  CardDetailPanel,
  describeActivity,
} from "../src/components/kanban/card-detail";
import { buildCardPatch } from "../src/features/cards/detail-hooks";
import { deriveCommentThread } from "../src/features/comments/thread";
import type { ActivityEntry } from "../src/features/activity/hooks";
import { queryClient } from "../src/lib/query-client";

const CARD = {
  id: "c1",
  listId: "l1",
  title: "Kartu A",
  description: "Desk awal",
  dueDate: "2026-09-01T00:00:00.000Z",
  assigneeUserId: "01JAAAAAAAAAAAAAAAAAAAAAAA",
  version: 4,
  archivedAt: null,
  deletedAt: null,
  labels: [{ id: "lb1", name: "backend", scope: "milestone" }],
};

function stubCardApi() {
  return vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    if (u.endsWith("/cards/c1")) {
      return Promise.resolve(jsonRes(200, { data: { card: CARD } }));
    }
    if (u.endsWith("/lists/l1")) {
      return Promise.resolve(
        jsonRes(200, { data: { list: { id: "l1", title: "Todo" } } }),
      );
    }
    if (u.endsWith("/cards/c1/activities")) {
      return Promise.resolve(jsonRes(200, { data: { activities: [] } }));
    }
    if (u.endsWith("/boards/b1/lists")) {
      return Promise.resolve(
        jsonRes(200, {
          data: {
            lists: [
              { id: "l1", boardId: "b1", title: "Todo" },
              { id: "l2", boardId: "b1", title: "Done" },
            ],
          },
        }),
      );
    }
    if (u.endsWith("/milestones/m1/boards/b1")) {
      return Promise.resolve(
        jsonRes(200, { data: { board: { id: "b1", title: "Board 1" } } }),
      );
    }
    if (u.endsWith("/milestones/m1")) {
      return Promise.resolve(
        jsonRes(200, { data: { milestone: { id: "m1", title: "M1" } } }),
      );
    }
    if (u.endsWith("/projects/p1")) {
      return Promise.resolve(
        jsonRes(200, { data: { project: { id: "p1", name: "P1" } } }),
      );
    }
    return Promise.reject(new Error(`unexpected ${u}`));
  });
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderDetail(currentUserId?: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <CardDetailPanel
        projectId="p1"
        milestoneId="m1"
        boardId="b1"
        cardId="c1"
        currentUserId={currentUserId}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("TASK-7.7.1 — Tab Details (current List, bukan status)", () => {
  test("positif: field domain tampil + List ditampilkan dengan judul dari API", async () => {
    vi.stubGlobal("fetch", stubCardApi());
    renderDetail();
    expect(await screen.findByText("Kartu A")).toBeTruthy();
    expect(screen.getByLabelText("Description").textContent).toContain("Desk awal");
    expect(screen.getByText("backend")).toBeTruthy();
    const listDt = screen.getByText("List");
    expect(listDt.textContent).toBe("List"); // §4 — label "List", bukan "Status"
    await waitFor(() => expect(screen.getByText("Todo")).toBeTruthy());
    expect(screen.queryByText(/^Status/)).toBeNull();
  });
});

describe("TASK-7.7.4 — generic update hanya field mutable; expectedVersion wajib", () => {
  test("negatif: buildCardPatch menolak field domain (listId/version/id)", () => {
    expect(() => buildCardPatch({ listId: "l2" }, 4)).toThrow(/listId/);
    expect(() => buildCardPatch({ version: 99 }, 4)).toThrow(/version/);
    expect(() => buildCardPatch({ id: "x" }, 4)).toThrow(/id/);
  });

  test("positif: buildCardPatch hanya memuat whitelist + expectedVersion", () => {
    expect(buildCardPatch({ title: "Baru", assignee: "01JBBB" }, 7)).toEqual({
      expectedVersion: 7,
      title: "Baru",
      assignee: "01JBBB",
    });
  });

  test("positif: simpan description memakai PATCH dengan body bersih + expectedVersion", async () => {
    const user = userEvent.setup();
    const fetchMock = stubCardApi();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "PATCH" && u.endsWith("/cards/c1")) {
        return Promise.resolve(
          jsonRes(200, { data: { card: { ...CARD, description: "Desk revisi", version: 5 } } }),
        );
      }
      return stubCardApi()(url);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail();
    const area = await screen.findByLabelText("Description");
    await user.clear(area);
    await user.type(area, "Desk revisi");
    await user.click(screen.getByRole("button", { name: /Simpan description/ }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => c[1]?.method === "PATCH")).toBe(true),
    );
    const patchCall = fetchMock.mock.calls.find((c) => c[1]?.method === "PATCH") as unknown as [
      string,
      RequestInit,
    ];
    expect(patchCall[0].endsWith("/api/v1/projects/p1/cards/c1")).toBe(true);
    expect(JSON.parse(String(patchCall[1].body))).toEqual({
      expectedVersion: 4,
      description: "Desk revisi",
    });
  });
});

describe("TASK-7.7.3 — Comments add + edit own, tanpa delete", () => {
  const activities: ActivityEntry[] = [
    mkEntry({ id: "a-add", actorUserId: "user-AAAA11", action: "comment.added", createdAt: "2026-08-25T08:00:00.000Z", data: { body: "Pertama" } }),
    mkEntry({ id: "a-edit", actorUserId: "user-AAAA11", action: "comment.edited", createdAt: "2026-08-25T09:00:00.000Z", data: { commentActivityId: "a-add", before: "Pertama", after: "Pertama (rev)" } }),
    mkEntry({ id: "b-add", actorUserId: "user-BBBB22", action: "comment.added", createdAt: "2026-08-25T08:30:00.000Z", data: { body: "Dari orang lain" } }),
  ];

  function mkEntry(partial: Partial<ActivityEntry>): ActivityEntry {
    return {
      id: "x",
      entityType: "card",
      entityId: "c1",
      entityVersion: 2,
      actorUserId: "u",
      action: "comment.added",
      data: {},
      createdAt: "2026-08-25T08:00:00.000Z",
      ...partial,
    };
  }

  test("positif: deriveCommentThread merangkai edit chain ke body terkini", () => {
    const thread = deriveCommentThread(activities);
    expect(thread).toHaveLength(2);
    const first = thread.find((t) => t.originalId === "a-add");
    expect(first?.body).toBe("Pertama (rev)");
    expect(first?.editedAt).toBeTruthy();
    const second = thread.find((t) => t.originalId === "b-add");
    expect(second?.body).toBe("Dari orang lain");
    expect(second?.editedAt).toBeNull();
  });

  test("negatif: tombol Edit hanya untuk komentar milik session user", async () => {
    const fetchMock = stubCardApi();
    fetchMock.mockImplementation((url: string) =>
      String(url).endsWith("/cards/c1/activities")
        ? Promise.resolve(jsonRes(200, { data: { activities } }))
        : stubCardApi()(url),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderDetail("user-AAAA11");
    (await screen.findByRole("button", { name: "Comments" })).click();
    await screen.findByText("Pertama (rev)");
    // Dua komentar dirender; tombol Edit hanya milik sendiri.
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
  });

  test("negatif: tanpa session → tidak ada tombol Edit sama sekali", async () => {
    const fetchMock = stubCardApi();
    fetchMock.mockImplementation((url: string) =>
      String(url).endsWith("/cards/c1/activities")
        ? Promise.resolve(jsonRes(200, { data: { activities } }))
        : stubCardApi()(url),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderDetail(undefined);
    (await screen.findByRole("button", { name: "Comments" })).click();
    await screen.findByText("Pertama (rev)");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  test("negatif: tidak ada tombol delete komentar di mana pun", async () => {
    const fetchMock = stubCardApi();
    fetchMock.mockImplementation((url: string) =>
      String(url).endsWith("/cards/c1/activities")
        ? Promise.resolve(jsonRes(200, { data: { activities } }))
        : stubCardApi()(url),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderDetail("user-AAAA11");
    (await screen.findByRole("button", { name: "Comments" })).click();
    await screen.findByText("Pertama (rev)");
    expect(screen.queryByRole("button", { name: /hapus|delete/i })).toBeNull();
  });

  test("positif: tambah komentar POST {body}; edit PATCH /comments/:activity_id", async () => {
    const user = userEvent.setup();
    let added = false;
    const fetchMock = stubCardApi();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.endsWith("/cards/c1/comments")) {
        added = true;
        return Promise.resolve(
          jsonRes(201, { data: { comment: { id: "n1", commentActivityId: "n1" } } }),
        );
      }
      if (init?.method === "PATCH" && u.includes("/comments/")) {
        return Promise.resolve(
          jsonRes(200, { data: { comment: { id: "e1", after: "revisi" } } }),
        );
      }
      if (u.endsWith("/cards/c1/activities")) {
        return Promise.resolve(
          jsonRes(200, {
            data: {
              activities: added
                ? [
                    ...activities,
                    mkEntry({ id: "c-add", actorUserId: "me", action: "comment.added", createdAt: "2026-08-25T10:00:00.000Z", data: { body: "baru" } }),
                  ]
                : activities,
            },
          }),
        );
      }
      return stubCardApi()(url);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("user-AAAA11");
    (await screen.findByRole("button", { name: "Comments" })).click();
    await screen.findByText("Pertama (rev)");
    await user.type(screen.getByLabelText(/Komentar/), "baru");
    await user.click(screen.getByRole("button", { name: /Kirim/ }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/cards/c1/comments") && c[1]?.method === "POST")).toBe(true),
    );
    await waitFor(() => expect(screen.getByText("baru")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const ta = screen.getByLabelText("Ubah komentar");
    await user.clear(ta);
    await user.type(ta, "revisi");
    await user.click(screen.getByRole("button", { name: /Simpan/ }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => c[1]?.method === "PATCH" && String(c[0]).includes("/comments/"))).toBe(true),
    );
  });
});

describe("TASK-7.7.2 — Tab Activity timeline immutable", () => {
  test("positif: tab activity merender grup hari + aksi dari endpoint kartu; read-only", async () => {
    const fetchMock = stubCardApi();
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.endsWith("/cards/c1/activities")) {
        return Promise.resolve(
          jsonRes(200, {
            data: {
              activities: [
                {
                  id: "m1",
                  entityType: "card",
                  entityId: "c1",
                  entityVersion: 3,
                  actorUserId: "u9",
                  action: "card.moved",
                  data: {
                    from: { listId: "l1", listTitle: "Todo" },
                    to: { listId: "l2", listTitle: "Review" },
                  },
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          }),
        );
      }
      return stubCardApi()(url);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail();
    (await screen.findByText("Activity")).closest("button")!.click();
    await waitFor(() => expect(screen.getByText(/Dipindahkan dari List “Todo” ke “Review”/)).toBeTruthy());
    expect(screen.getByLabelText("Activity timeline")).toBeTruthy();
    // Read-only: tidak ada tombol aksi pada timeline.
    const panel = screen.getByLabelText("Detail kartu");
    const timelineSection = screen.getByLabelText("Activity timeline");
    expect(timelineSection.querySelectorAll("button").length).toBe(0);
    void panel;
  });
});

describe("TASK-7.8.2 — render payload konteks historis (B.5)", () => {
  test("positif: moved memakai listTitle historis dari payload (nama List lama tetap tampil)", () => {
    const line = describeActivity({
      action: "card.moved",
      entityType: "card",
      data: {
        from: { listId: "l1", listTitle: "Todo Lama" },
        to: { listId: "l2", listTitle: "Review" },
      },
    });
    expect(line).toContain("Todo Lama");
    expect(line).toContain("Review");
  });

  test("positif: entity terhapus tetap terbaca via payload (tanpa lookup state kini)", () => {
    const line = describeActivity({
      action: "comment.edited",
      entityType: "activity",
      data: { after: "teks terakhir" },
    });
    expect(line).toContain("teks terakhir");
    expect(describeActivity({ action: "board.archived", entityType: "board", data: { previousState: "ACTIVE" } })).toContain("ACTIVE");
  });

  test("negatif: fallback action mentah bila payload tak dikenal (tidak mengarang)", () => {
    expect(describeActivity({ action: "label.removed", entityType: "card", data: {} })).toBe("label.removed");
  });
});
