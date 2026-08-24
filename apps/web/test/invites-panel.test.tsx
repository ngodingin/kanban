// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { InvitesPanel } from "../src/features/invitations/invites-panel";
import { queryClient } from "../src/lib/query-client";

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

function stubBase() {
  return vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    if (u.endsWith("/invitations")) {
      if (String(u) === "POST") return Promise.resolve(jsonRes(201, { data: {} }));
      return Promise.resolve(
        jsonRes(200, {
          data: {
            invitations: [
              {
                id: "inv1",
                email: "pending@example.com",
                expiresAt: "2099-01-01T00:00:00.000Z",
                acceptedAt: null,
                revokedAt: null,
                createdAt: "2026-08-20T00:00:00.000Z",
              },
            ],
          },
        }),
      );
    }
    if (u.endsWith("/permission-groups")) {
      return Promise.resolve(
        jsonRes(200, {
          data: { groups: [{ id: "g1", name: "Manager", permissions: [] }] },
        }),
      );
    }
    return Promise.reject(new Error(`unexpected ${u}`));
  });
}

describe("TASK-7.10.2 — Invite Email + Group + scope; konsumsi wrapper data.invitation", () => {
  test("positif: submit memanggil POST /invitations dengan assignments + Idempotency-Key; sukses mengosongkan email", async () => {
    const user = userEvent.setup();
    const fetchMock = stubBase();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <InvitesPanel projectId="p1" />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect((screen.getByLabelText(/Group/) as HTMLSelectElement).options.length).toBeGreaterThan(1),
    );

    await user.type(screen.getByLabelText(/Email/), "baru@example.com");
    await user.selectOptions(screen.getByLabelText(/Group/), "g1");
    await user.click(screen.getByRole("button", { name: /Undang/ }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((c) => String(c[0]) === "/api/v1/projects/p1/invitations"),
      ).toBe(true),
    );
    const createCall = fetchMock.mock.calls.find(
      (c) => String(c[0]) === "/api/v1/projects/p1/invitations" && c[1]?.method === "POST",
    ) as unknown as [string, RequestInit];
    expect(createCall[0]).toBe("/api/v1/projects/p1/invitations");
    expect(JSON.parse(String(createCall[1].body))).toEqual({
      email: "baru@example.com",
      assignments: [{ groupId: "g1", scopeType: "project", scopeId: "p1" }],
    });
    expect((createCall[1].headers as Headers).get("Idempotency-Key")).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe(""),
    );
  });

  test("positif: scope non-project menyertakan scopeId entity pada payload", async () => {
    const user = userEvent.setup();
    const fetchMock = stubBase();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <InvitesPanel projectId="p1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText(/Scope/)).toBeTruthy());
    await user.type(screen.getByLabelText(/Email/), "x@example.com");
    await user.selectOptions(screen.getByLabelText(/Group/), "g1");
    await user.selectOptions(screen.getByLabelText(/Scope/), "milestone");
    await user.type(screen.getByLabelText("Scope ID"), "m77");
    await user.click(screen.getByRole("button", { name: /Undang/ }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    const createCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes("/invitations") && c[1]?.method === "POST",
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(String(createCall[1].body)).assignments[0]).toEqual({
      groupId: "g1",
      scopeType: "milestone",
      scopeId: "m77",
    });
  });

  test("negatif: error server (mis. hierarchy-scope belum didukung) tampil sebagai alert jujur", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.endsWith("/invitations")) {
        return Promise.resolve(
          jsonRes(409, {
            error: {
              code: "INVALID_STATE",
              message: "scope_type 'milestone' belum didukung (hanya 'project').",
            },
          }),
        );
      }
      if (u.endsWith("/invitations")) {
        return Promise.resolve(jsonRes(200, { data: { invitations: [] } }));
      }
      if (u.endsWith("/permission-groups")) {
        return Promise.resolve(
          jsonRes(200, { data: { groups: [{ id: "g1", name: "Manager", permissions: [] }] } }),
        );
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <InvitesPanel projectId="p1" />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect((screen.getByLabelText(/Group/) as HTMLSelectElement).options.length).toBeGreaterThan(1),
    );
    await user.type(screen.getByLabelText(/Email/), "y@example.com");
    await user.selectOptions(screen.getByLabelText(/Group/), "g1");
    await user.selectOptions(screen.getByLabelText(/Scope/), "milestone");
    await user.type(screen.getByLabelText("Scope ID"), "m1");
    await user.click(screen.getByRole("button", { name: /Undang/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("INVALID_STATE");
    expect(alert.textContent).toContain("belum didukung");
  });

  test("positif: revoke memanggil endpoint nested dan menghilangkan baris setelah invalidasi", async () => {
    const user = userEvent.setup();
    let revoked = false;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.endsWith("/invitations/inv1/revoke")) {
        revoked = true;
        return Promise.resolve(
          jsonRes(200, {
            data: {
              invitation: { id: "inv1", revokedAt: "2026-08-25T00:00:00.000Z" },
            },
          }),
        );
      }
      if (u.endsWith("/invitations")) {
        return Promise.resolve(
          jsonRes(200, {
            data: {
              invitations: revoked
                ? []
                : [
                    {
                      id: "inv1",
                      email: "pending@example.com",
                      expiresAt: "2099-01-01T00:00:00.000Z",
                      acceptedAt: null,
                      revokedAt: null,
                      createdAt: "2026-08-20T00:00:00.000Z",
                    },
                  ],
            },
          }),
        );
      }
      if (u.endsWith("/permission-groups")) {
        return Promise.resolve(jsonRes(200, { data: { groups: [{ id: "g1", name: "M", permissions: [] }] } }));
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <InvitesPanel projectId="p1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("pending@example.com")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /Cabut/ }));
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => c[0]);
      expect(urls).toContain("/api/v1/projects/p1/invitations/inv1/revoke");
    });
    await waitFor(() => expect(screen.queryByText("pending@example.com")).toBeNull());
  });
});
