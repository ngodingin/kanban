// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, apiRequest, newIdempotencyKey } from "../src/lib/api/client";
import { queryClient } from "../src/lib/query-client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("TASK-7.1.3 — same-origin API client (02-SPEC C.2/C.3)", () => {
  test("positif: GET mengirim request benar dan mengembalikan envelope data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: { id: "p1" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest<{ id: string }>("/api/v1/projects/p1");
    expect(result).toEqual({ id: "p1" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/projects/p1");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
    const headers = init.headers as Headers;
    expect(headers.get("Idempotency-Key")).toBeNull();
  });

  test("positif: Idempotency-Key terlampir saat diberikan", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/v1/cards/c1/move", {
      method: "POST",
      body: { destinationListId: "l2", expectedVersion: 7 },
      idempotencyKey: "key-abc",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Idempotency-Key")).toBe("key-abc");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init.body).toBe(
      JSON.stringify({ destinationListId: "l2", expectedVersion: 7 }),
    );
  });

  test("negatif: envelope error dipetakan ke ApiError dengan code/status kanonik", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(409, {
          error: {
            code: "VERSION_CONFLICT",
            message: "The card has been modified by another request.",
          },
        }),
      ),
    );

    const error = await apiRequest("/api/v1/cards/c1/move", {
      method: "POST",
      body: {},
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.code).toBe("VERSION_CONFLICT");
    expect(apiError.status).toBe(409);
    expect(apiError.message).toContain("modified by another request");
  });

  test("negatif: IDEMPOTENCY_IN_PROGRESS dilempar sebagai error TANPA side-effect kedua (tepat satu fetch)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(409, { error: { code: "IDEMPOTENCY_IN_PROGRESS", message: "masih diproses" } }));
    vi.stubGlobal("fetch", fetchMock);

    // Satu logical action = satu pemanggilan apiRequest. Client TIDAK
    // melakukan retry internal sehingga tidak ada request kedua.
    await expect(
      apiRequest("/api/v1/cards/c1/archive", {
        method: "POST",
        body: { expectedVersion: 3 },
        idempotencyKey: "key-1",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_IN_PROGRESS", status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("negatif: IDEMPOTENCY_CONFLICT ditolak dengan fingerprint berbeda tanpa eksekusi handler", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(409, { error: { code: "IDEMPOTENCY_CONFLICT", message: "payload berbeda" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("/api/v1/projects", {
        method: "POST",
        body: { name: "beda" },
        idempotencyKey: "key-1",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("negatif: VALIDATION_ERROR membawa details seluruh field gagal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          error: {
            code: "VALIDATION_ERROR",
            message: "payload tidak valid",
            details: [
              { field: "title", reason: "wajib string non-kosong" },
              { field: "startDate", reason: "format tanggal salah" },
            ],
          },
        }),
      ),
    );

    const error = (await apiRequest("/api/v1/boards", {
      method: "POST",
      body: {},
    }).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details).toHaveLength(2);
    expect(error.details?.[0]?.field).toBe("title");
    expect(error.details?.[1]?.field).toBe("startDate");
  });

  test("negatif: kegagalan jaringan → NETWORK_ERROR status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const error = (await apiRequest("/api/v1/projects").catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.status).toBe(0);
  });

  test("newIdempotencyKey menghasilkan kunci unik per logical action", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(newIdempotencyKey());
    expect(seen.size).toBe(100);
  });

  test("positif: TanStack Query terpasang — hook server state lewat provider ter-render dengan data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { data: { status: "ok" } })),
    );
    function Probe() {
      const { data } = useQuery({
        queryKey: ["health"],
        queryFn: () => apiRequest<{ status: string }>("/api/v1/health"),
      });
      return <span>{data ? `server:${data.status}` : "loading"}</span>;
    }
    render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("server:ok")).toBeTruthy());
  });
});
