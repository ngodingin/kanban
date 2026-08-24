// @vitest-environment happy-dom
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ConfirmLifecycleDialog,
  subtreeImpactText,
} from "../src/components/kanban/confirm-lifecycle-dialog";
import { useLifecycleMutation } from "../src/features/lifecycle/hooks";
import { queryClient } from "../src/lib/query-client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  queryClient.clear();
});

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("TASK-7.13.1 — konfirmasi archive/delete menjelaskan dampak efektif subtree", () => {
  test("positif: pesan archive menjelaskan descendant non-operasional sampai dipulihkan", () => {
    expect(subtreeImpactText("board", "archive")).toMatch(
      /tidak operasional sampai Board dipulihkan/,
    );
    expect(subtreeImpactText("list", "archive")).toMatch(
      /tidak operasional sampai List dipulihkan/,
    );
  });

  test("positif: pesan delete menyatakan terminal + tidak dapat dipulihkan + prune", () => {
    const text = subtreeImpactText("board", "delete");
    expect(text).toMatch(/permanen/);
    expect(text).toMatch(/terminal/);
    expect(text).toMatch(/tidak dapat dipulihkan/);
    expect(text).toMatch(/prune/);
  });

  test("positif: dialog merender peringatan kuat untuk delete (tombol destruktif)", () => {
    render(
      <ConfirmLifecycleDialog
        kind="board"
        entityTitle="Sprint 1"
        action="delete"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("dialog").textContent).toContain("DIHAPUS secara permanen");
    expect(screen.getByRole("button", { name: /hapus permanen/i }).className).toContain(
      "bg-destructive",
    );
  });

  test("positif: useLifecycleMutation POST endpoint aksi yang benar dengan expectedVersion + Idempotency-Key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonRes(200, { data: { id: "b1", version: 5 } }));
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useLifecycleMutation("p1"), { wrapper });
    result.current.mutate({
      kind: "board",
      entityId: "b1",
      action: "archive",
      expectedVersion: 4,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/projects/p1/boards/b1/archive");
    expect(init.body).toBe(JSON.stringify({ expectedVersion: 4 }));
    expect((init.headers as Headers).get("Idempotency-Key")).toBeTruthy();
  });

  test("positif: project memakai endpoint /projects/:p/{action}; restore list ke /lists/:id/restore", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useLifecycleMutation("p9"), { wrapper });
    result.current.mutate({ kind: "project", entityId: "p9", action: "delete", expectedVersion: 1 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    result.current.mutate({
      kind: "list",
      entityId: "l2",
      action: "restore",
      expectedVersion: 3,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain("/api/v1/projects/p9/delete");
    expect(urls).toContain("/api/v1/projects/p9/lists/l2/restore");
  });

  test("negatif: konflik/state error ditampilkan di dialog tanpa menutup sendiri", () => {
    render(
      <ConfirmLifecycleDialog
        kind="card"
        entityTitle="Kartu A"
        action="archive"
        pending={false}
        error="INVALID_STATE — Card sudah DELETED."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("INVALID_STATE");
    // Dialog tetap terbuka (masih ada tombol konfirmasi) — keputusan ada pada pengguna.
    expect(screen.getByRole("button", { name: "Konfirmasi" })).toBeTruthy();
  });
});
