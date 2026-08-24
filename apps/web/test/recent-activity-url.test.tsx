// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
// Modul ASLI (tanpa mock) — bukti kontrak URL Project-scoped (BR-010/C.9).
import { RecentActivityPreview } from "../src/features/home/recent";
import { queryClient } from "../src/lib/query-client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("7.4.2 — Recent Activity hanya via endpoint Project-scoped", () => {
  test("positif+negatif: URL = /projects/:id/activities; tidak ada search/cross-project", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { activities: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <RecentActivityPreview projectId="p7" />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain("/api/v1/projects/p7/activities");
    for (const u of urls) {
      expect(u.startsWith("/api/v1/projects/")).toBe(true);
      expect(u).not.toMatch(/search|cross-project/i);
    }
    expect(screen.getByLabelText("Recent Activity")).toBeTruthy();
  });
});
