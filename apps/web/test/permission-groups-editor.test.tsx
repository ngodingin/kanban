// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import App from "../src/App";
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
  { id: "g1", name: "Manager", permissions: [{ permissionId: "p1", key: "card.read", cardReadVisibility: "ALL" }] },
  { id: "g2", name: "Contributor", permissions: [{ permissionId: "p1", key: "card.read", cardReadVisibility: "ASSIGNED_TO_ME" }, { permissionId: "p2", key: "card.update" }] },
];

const MEMBERS = [
  { membershipId: "ms1", userId: "u1", email: "eko@example.com", name: "Eko", createdAt: "2026-08-01T00:00:00.000Z", revokedAt: null },
  { membershipId: "ms2", userId: "u2", email: "dewi@example.com", name: "Dewi", createdAt: "2026-08-02T00:00:00.000Z", revokedAt: null },
];

const ASSIGNMENTS = [
  { id: "ga1", groupId: "g1", scopeType: "project", scopeId: "p1" },
];

const DIRECT_PERM_ASSIGNMENTS = [
  { id: "dp1", permissionId: "p2", scopeType: "milestone", scopeId: "m1", cardReadVisibility: null },
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
      return Promise.resolve(jsonRes(200, { data: { groupAssignments: ASSIGNMENTS, permissionAssignments: DIRECT_PERM_ASSIGNMENTS } }));
    }
    if (u.includes("/members/ms2/assignments") && method === "GET") {
      return Promise.resolve(jsonRes(200, { data: { groupAssignments: [], permissionAssignments: [] } }));
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
    if (u.includes("/members/ms1/permission-assignments") && method === "POST") {
      const body = JSON.parse(opts!.body as string) as { permissionId: string; scopeType: string; scopeId: string };
      const newAssignment = {
        id: `dp${DIRECT_PERM_ASSIGNMENTS.length + 1}`,
        permissionId: body.permissionId,
        scopeType: body.scopeType,
        scopeId: body.scopeId,
        cardReadVisibility: null,
      };
      return Promise.resolve(jsonRes(201, { data: { assignment: newAssignment } }));
    }
    if (u.includes("/members/ms1/permission-assignments/dp1/revoke") && method === "POST") {
      return Promise.resolve(jsonRes(200, { data: { assignment: DIRECT_PERM_ASSIGNMENTS[0] } }));
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

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <App />
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

    // Wait for assignments to load - use getAllByText to handle multiple Revoke buttons
    await waitFor(() => expect(screen.getAllByText("Revoke").length).toBeGreaterThan(0));

    // Click revoke - use the first Revoke button (group assignment)
    const revokeButtons = screen.getAllByRole("button", { name: "Revoke" });
    await user.click(revokeButtons[0]);

    // Wait for the API call to be made
    await waitFor(() => {
      const postCalls = api.mock.calls.filter(
        (c) => c[1]?.method === "POST" && String(c[0]).includes("/group-assignments/ga1/revoke"),
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });
});

describe("TASK-7.9.1 — App Route Integration", () => {
  test("positif: /projects/p1/permissions merender PermissionGroupsEditor", async () => {
    vi.stubGlobal("fetch", stubApi());
    renderApp("/projects/p1/permissions");
    await waitFor(() => expect(screen.getByText("Groups")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());
  });

  test("positif: sidebar Permissions link mengarah ke project-scoped route", async () => {
    vi.stubGlobal("fetch", stubApi());
    renderApp("/projects/p1/permissions");
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());
    const permissionsLink = screen.getByRole("link", { name: "Permissions" });
    expect(permissionsLink.getAttribute("href")).toBe("/projects/p1/permissions");
  });
});

describe("TASK-7.9.1 — Five Scope Payloads", () => {
  test.each([
    { scopeType: "project", scopeId: "p1", expectedScopeId: "p1" },
    { scopeType: "milestone", scopeId: "m1", expectedScopeId: "m1" },
    { scopeType: "board", scopeId: "b1", expectedScopeId: "b1" },
    { scopeType: "list", scopeId: "l1", expectedScopeId: "l1" },
    { scopeType: "card", scopeId: "c1", expectedScopeId: "c1" },
  ])("positif: submit assignment scope $scopeType mengirim payload benar", async ({ scopeType, scopeId, expectedScopeId }) => {
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

    // Select scope type - use the first Scope select (group assignment)
    const scopeSelects = screen.getAllByLabelText("Scope") as HTMLSelectElement[];
    const scopeSelect = scopeSelects[0];
    await user.selectOptions(scopeSelect, scopeType);

    // Fill scope ID for non-project scopes
    if (scopeType !== "project") {
      const scopeIdInput = screen.getByLabelText("Scope ID") as HTMLInputElement;
      await user.type(scopeIdInput, scopeId);
    }

    // Click assign button
    const assignButton = screen.getByRole("button", { name: "Assign" });
    await user.click(assignButton);

    // Wait for the API call and verify payload
    await waitFor(() => {
      const postCalls = api.mock.calls.filter(
        (c) => c[1]?.method === "POST" && String(c[0]).includes("/group-assignments"),
      );
      expect(postCalls.length).toBeGreaterThan(0);
      const lastCall = postCalls[postCalls.length - 1];
      const body = JSON.parse(lastCall[1].body as string);
      expect(body).toEqual({
        groupId: "g1",
        scopeType: scopeType,
        scopeId: expectedScopeId,
      });
    });
  });

  test("negatif: non-Project scope tanpa scopeId tidak dapat di-submit", async () => {
    vi.stubGlobal("fetch", stubApi());
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

    // Select milestone scope (non-project) - use the first Scope select (group assignment)
    const scopeSelects = screen.getAllByLabelText("Scope") as HTMLSelectElement[];
    const scopeSelect = scopeSelects[0];
    await user.selectOptions(scopeSelect, "milestone");

    // Don't fill scope ID
    const assignButton = screen.getByRole("button", { name: "Assign" });
    expect(assignButton.disabled).toBe(true);
  });
});

describe("TASK-7.9.2 — Card Visibility Selector", () => {
  test("positif: edit group menampilkan visibility existing untuk card.read", async () => {
    vi.stubGlobal("fetch", stubApi());
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());
    await user.click(screen.getByText("Manager"));

    // Manager has card.read with visibility ALL
    await waitFor(() => {
      const visibilitySelect = screen.getByDisplayValue("ALL") as HTMLSelectElement;
      expect(visibilitySelect).toBeTruthy();
    });
  });

  test("positif: visibility default adalah CREATED_BY_ME saat create baru + payload terkirim", async () => {
    const api = stubApi();
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());
    await user.click(screen.getByText("+ Baru"));

    // Fill group name
    const nameInput = screen.getByLabelText("Nama Group") as HTMLInputElement;
    await user.type(nameInput, "Test Group");

    // Check card.read checkbox
    const cardReadCheckbox = screen.getByText("card.read").closest("label")!.querySelector("input[type=checkbox]") as HTMLInputElement;
    await user.click(cardReadCheckbox);

    // Visibility selector should appear with default CREATED_BY_ME
    await waitFor(() => {
      const visibilitySelect = screen.getByDisplayValue("CREATED_BY_ME") as HTMLSelectElement;
      expect(visibilitySelect).toBeTruthy();
    });

    // Submit
    await user.click(screen.getByText("Buat"));

    // Wait for the API call and verify payload includes cardReadVisibility: "CREATED_BY_ME" for card.read
    await waitFor(() => {
      const postCalls = api.mock.calls.filter(
        (c) => c[1]?.method === "POST" && String(c[0]).includes("/permission-groups"),
      );
      expect(postCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(postCalls[postCalls.length - 1][1].body as string);
      expect(body.permissions).toContainEqual({
        permissionId: "p1",
        cardReadVisibility: "CREATED_BY_ME",
      });
    });
  });

  test("positif: non-card.read permission tidak mengirim cardReadVisibility", async () => {
    const api = stubApi();
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());
    await user.click(screen.getByText("+ Baru"));

    // Fill group name
    const nameInput = screen.getByLabelText("Nama Group") as HTMLInputElement;
    await user.type(nameInput, "Test Group 2");

    // Check card.update checkbox (NOT card.read)
    const cardUpdateCheckbox = screen.getByText("card.update").closest("label")!.querySelector("input[type=checkbox]") as HTMLInputElement;
    await user.click(cardUpdateCheckbox);

    // Submit
    await user.click(screen.getByText("Buat"));

    // Wait for the API call and verify payload does NOT include cardReadVisibility for card.update
    await waitFor(() => {
      const postCalls = api.mock.calls.filter(
        (c) => c[1]?.method === "POST" && String(c[0]).includes("/permission-groups"),
      );
      expect(postCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(postCalls[postCalls.length - 1][1].body as string);
      const cardUpdateEntry = body.permissions.find((p: { permissionId: string }) => p.permissionId === "p2");
      expect(cardUpdateEntry).toBeDefined();
      expect(cardUpdateEntry.cardReadVisibility).toBeUndefined();
    });
  });

  test("positif: visibility selector tidak muncul jika card.read tidak dipilih", async () => {
    vi.stubGlobal("fetch", stubApi());
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());
    await user.click(screen.getByText("+ Baru"));

    // Only check card.update (not card.read)
    const cardUpdateCheckbox = screen.getByText("card.update").closest("label")!.querySelector("input[type=checkbox]") as HTMLInputElement;
    await user.click(cardUpdateCheckbox);

    // Visibility selector should NOT appear
    expect(screen.queryByText("Visibility:")).toBeNull();
  });

  test("positif: ubah visibility terkirim saat submit", async () => {
    const api = stubApi();
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());

    // Click Manager to edit
    await user.click(screen.getByText("Manager"));
    await waitFor(() => {
      const visibilitySelect = screen.getByDisplayValue("ALL") as HTMLSelectElement;
      expect(visibilitySelect).toBeTruthy();
    });

    // Change visibility to CREATED_BY_ME
    const visibilitySelect = screen.getByDisplayValue("ALL") as HTMLSelectElement;
    await user.selectOptions(visibilitySelect, "CREATED_BY_ME");

    // Submit
    await user.click(screen.getByText("Simpan"));

    // Wait for the API call and verify payload includes cardReadVisibility
    await waitFor(() => {
      const patchCalls = api.mock.calls.filter(
        (c) => c[1]?.method === "PATCH" && String(c[0]).includes("/permission-groups/g1"),
      );
      expect(patchCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(patchCalls[patchCalls.length - 1][1].body as string);
      expect(body.permissions).toContainEqual(
        expect.objectContaining({
          permissionId: "p1",
          cardReadVisibility: "CREATED_BY_ME",
        }),
      );
    });
  });
});

describe("TASK-7.9.3 — Direct Permission Assignment", () => {
  test("positif: menampilkan direct permission assignments dari API", async () => {
    vi.stubGlobal("fetch", stubApi());
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());

    // Select first member
    const memberSelect = screen.getByDisplayValue("— Pilih member —") as HTMLSelectElement;
    await user.selectOptions(memberSelect, "ms1");

    // Wait for direct permission section to appear
    await waitFor(() => expect(screen.getByText("Direct Permission Assignments")).toBeTruthy());

    // Should show existing direct permission
    expect(screen.getByText("card.update")).toBeTruthy();
    expect(screen.getByText("scope: milestone (m1)")).toBeTruthy();
  });

  test("positif: direct permission form ada", async () => {
    vi.stubGlobal("fetch", stubApi());
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());

    // Select first member
    const memberSelect = screen.getByDisplayValue("— Pilih member —") as HTMLSelectElement;
    await user.selectOptions(memberSelect, "ms1");

    // Wait for direct permission form
    await waitFor(() => expect(screen.getByText("Assign Permission")).toBeTruthy());

    // Permission select should exist
    expect(screen.getByLabelText("Permission")).toBeTruthy();
  });

  test("positif: card.read permission menampilkan visibility selector", async () => {
    vi.stubGlobal("fetch", stubApi());
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());

    // Select first member
    const memberSelect = screen.getByDisplayValue("— Pilih member —") as HTMLSelectElement;
    await user.selectOptions(memberSelect, "ms1");

    // Wait for direct permission form
    await waitFor(() => expect(screen.getByText("Assign Permission")).toBeTruthy());

    // Select card.read permission
    const permSelect = screen.getByLabelText("Permission") as HTMLSelectElement;
    await user.selectOptions(permSelect, "p1"); // card.read

    // Visibility selector should appear
    await waitFor(() => {
      const visibilitySelect = screen.getByLabelText("Visibility") as HTMLSelectElement;
      expect(visibilitySelect).toBeTruthy();
      expect(visibilitySelect.value).toBe("CREATED_BY_ME");
    });
  });
});
