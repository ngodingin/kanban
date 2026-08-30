import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../../src/lib/api/client";

const mockFetch = vi.fn();

describe("TASK-7.3.1 — Project list API client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mengambil envelope Project yang benar melalui apiRequest", async () => {
    const projects = [
      { id: "p1", name: "Project Alpha" },
      { id: "p2", name: "Project Beta" },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { projects } }),
    });

    const result = await apiRequest<{ projects: typeof projects }>("/api/v1/projects");

    expect(result.projects).toEqual(projects);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/projects",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });

  it("tidak mengarang daftar Project bila envelope tidak memuat projects", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    });

    const result = await apiRequest<{ projects?: unknown }>("/api/v1/projects");

    expect(result.projects).toBeUndefined();
  });

  it("meneruskan UNAUTHORIZED dari API, bukan menampilkan Project demo", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
      }),
    });

    await expect(apiRequest("/api/v1/projects")).rejects.toMatchObject<ApiError>({
      code: "UNAUTHORIZED",
      status: 401,
    });
  });
});
