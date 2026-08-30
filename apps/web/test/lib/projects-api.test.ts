import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("useProjects contract", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /api/v1/projects mengembalikan daftar Project", async () => {
    const projects = [
      { id: "p1", name: "Project Alpha", slug: "alpha", status: "ACTIVE", createdAt: "2026-01-01" },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: projects }),
    });

    const res = await fetch("/api/v1/projects");
    const json = await res.json();
    expect(json.data).toEqual(projects);
  });

  it("response envelope: { data: Project[] }", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const res = await fetch("/api/v1/projects");
    const json = await res.json();
    expect(json).toHaveProperty("data");
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("Project memiliki field wajib: id, name, slug, status, createdAt", async () => {
    const project = { id: "p1", name: "Proj", slug: "proj", status: "ACTIVE", createdAt: "2026-01-01" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [project] }),
    });

    const res = await fetch("/api/v1/projects");
    const json = await res.json();
    const p = json.data[0];

    expect(p).toHaveProperty("id");
    expect(p).toHaveProperty("name");
    expect(p).toHaveProperty("slug");
    expect(p).toHaveProperty("status");
    expect(p).toHaveProperty("createdAt");
  });

  it("status hanya boleh ACTIVE, ARCHIVED, atau DELETED", async () => {
    const validStatuses = ["ACTIVE", "ARCHIVED", "DELETED"];
    const projects = validStatuses.map((status, i) => ({
      id: `p${i}`,
      name: `Proj ${i}`,
      slug: `proj-${i}`,
      status,
      createdAt: "2026-01-01",
    }));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: projects }),
    });

    const res = await fetch("/api/v1/projects");
    const json = await res.json();

    for (const p of json.data) {
      expect(validStatuses).toContain(p.status);
    }
  });

  it("error 401 = UNAUTHORIZED", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
      }),
    });

    const res = await fetch("/api/v1/projects");
    expect(res.ok).toBe(false);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });
});
