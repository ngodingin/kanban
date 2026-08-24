// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  MembersTable,
  memberStatus,
} from "../src/features/members/members-table";
import { isPendingInvitation } from "../src/features/members/hooks";
import { queryClient } from "../src/lib/query-client";

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubApi() {
  return vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    if (u.endsWith("/members")) {
      return Promise.resolve(
        jsonRes(200, {
          data: {
            members: [
              {
                membershipId: "ms1",
                userId: "u1",
                email: "eko@example.com",
                name: "Eko",
                createdAt: "2026-08-01T00:00:00.000Z",
                revokedAt: null,
              },
              {
                membershipId: "ms2",
                userId: "u2",
                email: "dewi@example.com",
                name: "Dewi",
                createdAt: "2026-08-02T00:00:00.000Z",
                revokedAt: "2026-08-10T00:00:00.000Z",
              },
            ],
          },
        }),
      );
    }
    if (u.endsWith("/invitations")) {
      return Promise.resolve(
        jsonRes(200, {
          data: {
            invitations: [
              {
                id: "inv1",
                email: "baru@example.com",
                expiresAt: "2027-01-01T00:00:00.000Z",
                acceptedAt: null,
                revokedAt: null,
                createdAt: "2026-08-20T00:00:00.000Z",
              },
              {
                id: "inv2",
                email: "lama@example.com",
                expiresAt: "2027-01-01T00:00:00.000Z",
                acceptedAt: "2026-08-05T00:00:00.000Z",
                revokedAt: null,
                createdAt: "2026-08-04T00:00:00.000Z",
              },
            ],
          },
        }),
      );
    }
    if (u.endsWith("/permission-groups")) {
      return Promise.resolve(
        jsonRes(200, {
          data: {
            groups: [{ id: "g1", name: "Manager", permissions: [] }],
          },
        }),
      );
    }
    if (u.includes("/members/ms1/assignments")) {
      return Promise.resolve(
        jsonRes(200, {
          data: {
            groupAssignments: [
              { id: "ga1", groupId: "g1", scopeType: "project", scopeId: "p1" },
            ],
            permissionAssignments: [],
          },
        }),
      );
    }
    return Promise.reject(new Error(`unexpected ${u}`));
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("TASK-7.10.1 — Tabel Members (User · Group · Status Active/Pending)", () => {
  test("positif: baris member aktif menampilkan User, Group (nama), Status Active", async () => {
    vi.stubGlobal("fetch", stubApi());
    render(
      <QueryClientProvider client={queryClient}>
        <MembersTable projectId="p1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Eko")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());
    const row = screen.getByText("Eko").closest("tr")!;
    expect(row.textContent).toContain("eko@example.com");
    expect(row.textContent).toContain("Active");
  });

  test("positif: invitation belum di-accept tampil sebagai Pending; accepted tidak", async () => {
    vi.stubGlobal("fetch", stubApi());
    render(
      <QueryClientProvider client={queryClient}>
        <MembersTable projectId="p1" />
      </QueryClientProvider>,
    );
    // Await sungguhan — assertion floating (QA-CL-14) tidak boleh terulang.
    const pendingRow = (await screen.findByText("baru@example.com")).closest("tr")!;
    expect(pendingRow.textContent).toContain("Pending");
    // Invitation yang sudah accepted TIDAK dirender sebagai baris Pending.
    expect(screen.queryByText("lama@example.com")).toBeNull();
  });

  test("negatif: membership revoked berstatus Revoked, bukan Active", async () => {
    vi.stubGlobal("fetch", stubApi());
    render(
      <QueryClientProvider client={queryClient}>
        <MembersTable projectId="p1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Dewi")).toBeTruthy());
    const row = screen.getByText("Dewi").closest("tr")!;
    expect(row.textContent).toContain("Revoked");
    expect(row.textContent).not.toContain("Active");
  });

  test("helper murni: memberStatus & isPendingInvitation", () => {
    expect(
      memberStatus({
        membershipId: "m",
        userId: "u",
        email: "e",
        name: "n",
        createdAt: "x",
        revokedAt: null,
      }),
    ).toBe("Active");
    expect(isPendingInvitation({ acceptedAt: null, revokedAt: null, expiresAt: "2099-01-01T00:00:00.000Z" })).toBe(true);
    // Negatif: expired bukan pending.
    expect(isPendingInvitation({ acceptedAt: null, revokedAt: null, expiresAt: "2020-01-01T00:00:00.000Z" })).toBe(false);
    expect(isPendingInvitation({ acceptedAt: null, revokedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" })).toBe(false);
  });
});
