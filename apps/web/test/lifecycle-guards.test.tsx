// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  availableLifecycleActions,
  describeRestoreBlock,
} from "../src/features/lifecycle/guards";
import {
  LifecycleActionsMenu,
} from "../src/components/kanban/lifecycle-actions-menu";
import { ApiError } from "../src/lib/api/client";
import { queryClient } from "../src/lib/query-client";

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderMenu(props: Parameters<typeof LifecycleActionsMenu>[0]) {
  return render(
    <QueryClientProvider client={queryClient}>
      <LifecycleActionsMenu {...props} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("TASK-7.13.2 — Restore hanya ARCHIVED; DELETED tanpa tombol restore", () => {
  test("positif: ACTIVE menawarkan archive+delete; ARCHIVED hanya restore", () => {
    expect(availableLifecycleActions({ archivedAt: null, deletedAt: null })).toEqual([
      "archive",
      "delete",
    ]);
    expect(
      availableLifecycleActions({ archivedAt: "2026-08-01T00:00:00.000Z", deletedAt: null }),
    ).toEqual(["restore"]);
  });

  test("negatif: DELETED tidak menawarkan apa pun (terminal, tanpa tombol restore)", () => {
    expect(availableLifecycleActions({ deletedAt: "2026-08-01T00:00:00.000Z" })).toEqual([]);
    const { container } = renderMenu({
      projectId: "p1",
      kind: "list",
      entityId: "l1",
      entityTitle: "Todo",
      expectedVersion: 2,
      deletedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  test("positif: menu ARCHIVED merender hanya tombol Pulihkan", () => {
    renderMenu({
      projectId: "p1",
      kind: "list",
      entityId: "l1",
      entityTitle: "Todo",
      expectedVersion: 2,
      archivedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(screen.getByLabelText(/Pulihkan Todo/)).toBeTruthy();
    expect(screen.queryByLabelText(/Arsipkan Todo/)).toBeNull();
    expect(screen.queryByLabelText(/Hapus Todo/)).toBeNull();
  });
});

describe("TASK-7.13.3 — restore ditolak ancestor belum ACTIVE + shortcut Restore parent first", () => {
  test("positif: describeRestoreBlock mengenali INVALID_STATE dan mengambil jenis ancestor dari pesan server", () => {
    const block = describeRestoreBlock(
      new ApiError("INVALID_STATE", 409, "List tidak dapat dipulihkan karena Board induknya masih ARCHIVED."),
    );
    expect(block?.ancestorKind).toBe("board");
    expect(block?.hint).toMatch(/Pulihkan board terlebih dahulu/);
    // Bukan error lain / bukan ApiError → bukan blok restore.
    expect(describeRestoreBlock(new ApiError("PERMISSION_DENIED", 403, "x"))).toBeNull();
    expect(describeRestoreBlock(new Error("x"))).toBeNull();
  });

  test("positif: klik 'Restore board first' menjalankan restore pada PARENT dengan version parent", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith("/lists/l1/restore")) {
        return Promise.resolve(
          jsonRes(409, {
            error: {
              code: "INVALID_STATE",
              message: "List tidak dapat dipulihkan karena Board induknya masih ARCHIVED.",
            },
          }),
        );
      }
      if (String(url).endsWith("/boards/b1/restore")) {
        return Promise.resolve(jsonRes(200, { data: { id: "b1", version: 6 } }));
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderMenu({
      projectId: "p1",
      kind: "list",
      entityId: "l1",
      entityTitle: "Todo",
      expectedVersion: 3,
      archivedAt: "2026-08-01T00:00:00.000Z",
      parent: { kind: "board", id: "b1", title: "Sprint 1", expectedVersion: 5 },
    });

    await user.click(screen.getByLabelText(/Pulihkan Todo/));
    await user.click(screen.getByRole("button", { name: "Konfirmasi" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(/Board induknya masih ARCHIVED/)).toBeTruthy();

    // Shortcut aktif — memanggil restore PARENT, bukan sekadar pesan pasif.
    await user.click(screen.getByRole("button", { name: /restore board first/i }));
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => c[0]);
      expect(urls).toContain("/api/v1/projects/p1/boards/b1/restore");
    });
    const restoreCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("/boards/b1/restore"),
    ) as unknown as [string, RequestInit];
    expect(restoreCall[1].body).toBe(JSON.stringify({ expectedVersion: 5 }));
  });

  test("negatif: error non-INVALID_STATE tidak memunculkan hint restore-parent", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonRes(403, { error: { code: "PERMISSION_DENIED", message: "tidak diizinkan" } }),
      ),
    );
    renderMenu({
      projectId: "p1",
      kind: "list",
      entityId: "l1",
      entityTitle: "Todo",
      expectedVersion: 3,
      archivedAt: "2026-08-01T00:00:00.000Z",
      parent: { kind: "board", id: "b1", title: "Sprint 1", expectedVersion: 5 },
    });
    await user.click(screen.getByLabelText(/Pulihkan Todo/));
    await user.click(screen.getByRole("button", { name: "Konfirmasi" }));
    await waitFor(() =>
      expect(screen.getByText(/PERMISSION_DENIED/)).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: /restore .* first/i })).toBeNull();
  });
});
