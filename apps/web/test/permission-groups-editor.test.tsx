// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PermissionGroupsEditor } from "../src/features/permissions/permission-groups-editor";
import { queryClient } from "../src/lib/query-client";

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PERMISSIONS = [
  { id: "p1", key: "card.read", description: "Baca Card" },
  { id: "p2", key: "card.update", description: "Ubah Card" },
  { id: "p3", key: "card.move", description: "Pindah Card" },
];

const GROUPS = [
  { id: "g1", name: "Manager", permissions: [{ permissionId: "p1", key: "card.read" }] },
  { id: "g2", name: "Contributor", permissions: [{ permissionId: "p1", key: "card.read" }, { permissionId: "p2", key: "card.update" }] },
];

function stubApi() {
  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    const u = String(url);
    const method = opts?.method ?? "GET";

    if (u.endsWith("/permissions") && method === "GET") {
      return Promise.resolve(jsonRes(200, { data: { permissions: PERMISSIONS } }));
    }
    if (u.endsWith("/permission-groups") && method === "GET") {
      return Promise.resolve(jsonRes(200, { data: { groups: GROUPS } }));
    }
    if (u.endsWith("/permission-groups") && method === "POST") {
      const body = JSON.parse(opts!.body as string) as { name: string; permissions: Array<{ permissionId: string }> };
      const newGroup = {
        id: `g${GROUPS.length + 1}`,
        name: body.name,
        permissions: body.permissions,
      };
      return Promise.resolve(jsonRes(201, { data: { group: newGroup } }));
    }
    if (u.includes("/permission-groups/g1") && method === "PATCH") {
      const body = JSON.parse(opts!.body as string) as { name?: string; permissions?: Array<{ permissionId: string }> };
      const updated = {
        ...GROUPS[0],
        name: body.name ?? GROUPS[0].name,
        permissions: body.permissions
          ? body.permissions.map((p) => ({ permissionId: p.permissionId, key: PERMISSIONS.find((x) => x.id === p.permissionId)?.key ?? "" }))
          : GROUPS[0].permissions,
      };
      return Promise.resolve(jsonRes(200, { data: { group: updated } }));
    }
    if (u.includes("/permission-groups/g1/delete") && method === "POST") {
      return Promise.resolve(jsonRes(200, { data: { group: GROUPS[0] } }));
    }
    return Promise.reject(new Error(`unexpected ${u} ${method}`));
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("TASK-7.9.1 — Permission Groups Editor", () => {
  test("positif: menampilkan daftar group dari API", async () => {
    vi.stubGlobal("fetch", stubApi());
    render(
      <QueryClientProvider client={queryClient}>
        <PermissionGroupsEditor projectId="p1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());
    expect(screen.getByText("Contributor")).toBeTruthy();
  });

  test("positif: klik group menampilkan form edit dengan nama & permissions", async () => {
    vi.stubGlobal("fetch", stubApi());
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <PermissionGroupsEditor projectId="p1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());
    await user.click(screen.getByText("Manager"));

    expect(screen.getByText(/Edit: Manager/)).toBeTruthy();
    const nameInput = screen.getByDisplayValue("Manager") as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    // Manager punya 1 permission (card.read)
    expect((screen.getByText("card.read").closest("label")!.querySelector("input[type=checkbox]") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByText("card.update").closest("label")!.querySelector("input[type=checkbox]") as HTMLInputElement).checked).toBe(false);
  });

  test("positif: tombol '+ Baru' membuka form create", async () => {
    vi.stubGlobal("fetch", stubApi());
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <PermissionGroupsEditor projectId="p1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());
    await user.click(screen.getByText("+ Baru"));

    expect(screen.getByText("Buat Group Baru")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Buat" })).toBeTruthy();
  });

  test("negatif: kosong menampilkan pesan placeholder", async () => {
    // Stub dengan groups kosong
    const emptyApi = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.endsWith("/permissions")) {
        return Promise.resolve(jsonRes(200, { data: { permissions: [] } }));
      }
      if (u.endsWith("/permission-groups")) {
        return Promise.resolve(jsonRes(200, { data: { groups: [] } }));
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    });
    vi.stubGlobal("fetch", emptyApi);
    render(
      <QueryClientProvider client={queryClient}>
        <PermissionGroupsEditor projectId="p1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Belum ada group.")).toBeTruthy());
    expect(screen.getByText("Pilih group untuk diedit atau buat baru.")).toBeTruthy();
  });
});
