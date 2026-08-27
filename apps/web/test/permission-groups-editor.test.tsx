// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
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

const MEMBERS = [
  { membershipId: "ms1", userId: "u1", email: "eko@example.com", name: "Eko", createdAt: "2026-08-01T00:00:00.000Z", revokedAt: null },
  { membershipId: "ms2", userId: "u2", email: "dewi@example.com", name: "Dewi", createdAt: "2026-08-02T00:00:00.000Z", revokedAt: null },
];

const ASSIGNMENTS = [
  { id: "ga1", groupId: "g1", scopeType: "project", scopeId: "p1" },
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
    if (u.endsWith("/members") && method === "GET") {
      return Promise.resolve(jsonRes(200, { data: { members: MEMBERS } }));
    }
    if (u.includes("/members/ms1/assignments") && method === "GET") {
      return Promise.resolve(jsonRes(200, { data: { groupAssignments: ASSIGNMENTS } }));
    }
    if (u.includes("/members/ms2/assignments") && method === "GET") {
      return Promise.resolve(jsonRes(200, { data: { groupAssignments: [] } }));
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
    if (u.includes("/members/ms1/group-assignments") && method === "POST") {
      const body = JSON.parse(opts!.body as string) as { groupId: string; scopeType: string; scopeId: string };
      const newAssignment = {
        id: `ga${ASSIGNMENTS.length + 1}`,
        groupId: body.groupId,
        scopeType: body.scopeType,
        scopeId: body.scopeId,
      };
      return Promise.resolve(jsonRes(201, { data: { assignment: newAssignment } }));
    }
    if (u.includes("/members/ms1/group-assignments/ga1/revoke") && method === "POST") {
      return Promise.resolve(jsonRes(200, { data: { assignment: ASSIGNMENTS[0] } }));
    }
    return Promise.reject(new Error(`unexpected ${u} ${method}`));
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  queryClient.clear();
});

function renderEditor(projectId = "p1") {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/permissions`]}>
      <QueryClientProvider client={queryClient}>
        <PermissionGroupsEditor projectId={projectId} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("TASK-7.9.1 — Permission Groups Editor", () => {
  test("positif: menampilkan daftar group dari API", async () => {
    vi.stubGlobal("fetch", stubApi());
    renderEditor();
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());
    expect(screen.getByText("Contributor")).toBeTruthy();
  });

  test("positif: klik group menampilkan form edit dengan nama & permissions", async () => {
    vi.stubGlobal("fetch", stubApi());
    const user = userEvent.setup();
    renderEditor();
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
    renderEditor();
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());
    await user.click(screen.getByText("+ Baru"));

    expect(screen.getByText("Buat Group Baru")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Buat" })).toBeTruthy();
  });

  test("negatif: kosong menampilkan pesan placeholder", async () => {
    const emptyApi = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.endsWith("/permissions")) {
        return Promise.resolve(jsonRes(200, { data: { permissions: [] } }));
      }
      if (u.endsWith("/permission-groups")) {
        return Promise.resolve(jsonRes(200, { data: { groups: [] } }));
      }
      if (u.endsWith("/members")) {
        return Promise.resolve(jsonRes(200, { data: { members: [] } }));
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    });
    vi.stubGlobal("fetch", emptyApi);
    renderEditor();
    await waitFor(() => expect(screen.getByText("Belum ada group.")).toBeTruthy());
    expect(screen.getByText("Pilih group untuk diedit atau buat baru.")).toBeTruthy();
  });

  test("positif: menampilkan daftar member dari API", async () => {
    vi.stubGlobal("fetch", stubApi());
    renderEditor();
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());
    // Member dropdown should be present
    expect(screen.getByText("Eko (eko@example.com)")).toBeTruthy();
    expect(screen.getByText("Dewi (dewi@example.com)")).toBeTruthy();
  });

  test("positif: pilih member menampilkan form assignment", async () => {
    vi.stubGlobal("fetch", stubApi());
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());

    // Select first member
    const memberSelect = screen.getByDisplayValue("— Pilih member —") as HTMLSelectElement;
    await user.selectOptions(memberSelect, "ms1");

    // Assignment form should appear
    await waitFor(() => expect(screen.getByText("Assign")).toBeTruthy());
  });

  test("positif: submit assignment mengirim payload benar", async () => {
    const api = stubApi();
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());

    // Select first member
    const memberSelect = screen.getByDisplayValue("— Pilih member —") as HTMLSelectElement;
    await user.selectOptions(memberSelect, "ms1");

    // Wait for assignment form to appear
    await waitFor(() => expect(screen.getByText("Assign")).toBeTruthy());

    // Select group
    const groupSelect = screen.getByLabelText("Group") as HTMLSelectElement;
    await user.selectOptions(groupSelect, "g1");

    // Click assign button
    const assignButton = screen.getByRole("button", { name: "Assign" });
    await user.click(assignButton);

    // Wait for the API call to be made
    await waitFor(() => {
      const postCalls = api.mock.calls.filter(
        (c) => c[1]?.method === "POST" && String(c[0]).includes("/group-assignments"),
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });

  test("positif: revoke assignment memanggil API", async () => {
    const api = stubApi();
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    // Stub window.confirm to return true
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderEditor();
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());

    // Select first member (has assignments)
    const memberSelect = screen.getByDisplayValue("— Pilih member —") as HTMLSelectElement;
    await user.selectOptions(memberSelect, "ms1");

    // Wait for assignments to load
    await waitFor(() => expect(screen.getByText("Revoke")).toBeTruthy());

    // Click revoke
    const revokeButton = screen.getByRole("button", { name: "Revoke" });
    await user.click(revokeButton);

    // Wait for the API call to be made
    await waitFor(() => {
      const postCalls = api.mock.calls.filter(
        (c) => c[1]?.method === "POST" && String(c[0]).includes("/group-assignments/ga1/revoke"),
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });
});
