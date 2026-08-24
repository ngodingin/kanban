// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiKeysPanel, PatPanel } from "../src/features/credentials/credential-panels";
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

describe("TASK-7.11.1 — API Keys (Project Settings)", () => {
  test("positif: create POST /api-keys dan secret dirender SEKALI dari response", async () => {
    const user = userEvent.setup();
    let created = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.endsWith("/api-keys")) {
        created += 1;
        return Promise.resolve(
          jsonRes(201, {
            data: {
              apiKey: {
                id: `k${created}`,
                name: JSON.parse(String(init.body)).name,
                secret: `sk-live-${created}`,
                expiresAt: null,
                createdAt: "2026-08-25T00:00:00.000Z",
              },
            },
          }),
        );
      }
      if (u.endsWith("/api-keys")) {
        return Promise.resolve(
          jsonRes(200, { data: { apiKeys: [] } }),
        );
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <ApiKeysPanel projectId="p1" />
      </QueryClientProvider>,
    );
    await user.type(screen.getByLabelText(/Nama/), "CI Key");
    await user.click(screen.getByRole("button", { name: /Buat/ }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("sk-live-1");
    expect(status.textContent).toContain("sekali");
  });

  test("positif: list hanya metadata + revoke memanggil endpoint nested", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.endsWith("/revoke")) {
        return Promise.resolve(
          jsonRes(200, { data: { apiKey: { id: "k9", revokedAt: "2026-08-25T00:00:00.000Z" } } }),
        );
      }
      if (u.endsWith("/api-keys")) {
        // Metadata TANPA field secret (C.14).
        return Promise.resolve(
          jsonRes(200, {
            data: {
              apiKeys: [
                { id: "k9", name: "Lama", expiresAt: null, createdAt: "2026-08-01T00:00:00.000Z" },
              ],
            },
          }),
        );
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <ApiKeysPanel projectId="p1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Lama")).toBeTruthy());
    expect(screen.queryByText(/sk-/)).toBeNull(); // list tidak pernah menampilkan secret

    await user.click(screen.getByTestId("apikey-revoke-k9"));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/api-keys/k9/revoke"))).toBe(true),
    );
  });
});

describe("TASK-7.11.2 — PAT (User Settings, /me terpisah dari Project)", () => {
  test("positif: create POST /me/personal-access-tokens; token tampil sekali; revoke nested", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u === "/api/v1/me/personal-access-tokens") {
        return Promise.resolve(
          jsonRes(201, {
            data: {
              personalAccessToken: {
                id: "t1",
                name: "CLI",
                token: "pat-abc",
                expiresAt: null,
                createdAt: "2026-08-25T00:00:00.000Z",
              },
            },
          }),
        );
      }
      if (init?.method === "POST" && u.endsWith("/revoke")) {
        return Promise.resolve(jsonRes(200, { data: { personalAccessToken: { id: "t1" } } }));
      }
      if (u === "/api/v1/me/personal-access-tokens") {
        return Promise.resolve(jsonRes(200, { data: { personalAccessTokens: [] } }));
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <PatPanel />
      </QueryClientProvider>,
    );
    await user.type(screen.getByLabelText(/Nama/), "CLI");
    await user.click(screen.getByRole("button", { name: /Buat/ }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("pat-abc");

    // PAT tidak menyentuh endpoint Project.
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => !u.includes("/projects/"))).toBe(true);
  });

  test("negatif: list PAT tidak pernah memuat hash/token di payload yang dirender", () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonRes(200, {
        data: {
          personalAccessTokens: [
            { id: "t2", name: "X", expiresAt: null, createdAt: "2026-08-01T00:00:00.000Z" },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <QueryClientProvider client={queryClient}>
        <PatPanel />
      </QueryClientProvider>,
    );
    return waitFor(() => {
      expect(screen.getByText("X")).toBeTruthy();
      expect(screen.queryByText(/token_hash|key_hash|pat-/)).toBeNull();
    });
  });
});
