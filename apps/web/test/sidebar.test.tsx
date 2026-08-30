// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Sidebar } from "../src/components/layout/sidebar";

vi.mock("../src/lib/use-projects", () => ({
  useProjects: vi.fn(),
}));

import { useProjects } from "../src/lib/use-projects";
const mockUseProjects = vi.mocked(useProjects);

interface MockProject {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
}

function renderSidebar(
  path = "/",
  opts?: { projects?: MockProject[]; isLoading?: boolean },
) {
  const { projects = [], isLoading = false } = opts ?? {};
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  mockUseProjects.mockReturnValue({
    data: projects,
    isLoading,
    isSuccess: !isLoading,
    isError: false,
    error: null,
  } as ReturnType<typeof useProjects>);
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TASK-7.3.1 — Sidebar context-aware (tanpa Inbox)", () => {
  test("positif: seluruh item wajib §5 tampil", () => {
    renderSidebar();
    for (const label of [
      "Home",
      "My Tasks",
      "Activity",
      "PROJECTS ▾",
      "Members",
      "Permissions",
      "API Keys",
      "Settings",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  test("negatif: tidak ada Inbox dan tidak ada elemen non-MVP lain", () => {
    const { container } = renderSidebar();
    expect(screen.queryByText(/inbox/i)).toBeNull();
    expect(container.textContent).not.toMatch(/revenue|analytics|billing|admin panel|notification/i);
  });

  test("positif: context-aware — route aktif ditandai (aria-current) sesuai path", () => {
    renderSidebar("/members");
    const active = screen.getByText("Members");
    expect(active.getAttribute("aria-current")).toBe("page");
  });

  test("positif: Home aktif hanya pada path root (end matching)", () => {
    renderSidebar("/");
    expect(screen.getByText("Home").getAttribute("aria-current")).toBe("page");
    cleanup();
    renderSidebar("/tasks");
    expect(screen.getByText("Home").getAttribute("aria-current")).toBeNull();
  });

  test("positif: Project dari API ditampilkan di sidebar", () => {
    const projects = [
      { id: "p1", name: "Project Alpha", slug: "alpha", status: "ACTIVE", createdAt: "2026-01-01" },
      { id: "p2", name: "Project Beta", slug: "beta", status: "ACTIVE", createdAt: "2026-01-02" },
    ];
    renderSidebar("/", { projects });
    expect(screen.getByText("Project Alpha")).toBeTruthy();
    expect(screen.getByText("Project Beta")).toBeTruthy();
  });

  test("positif: Project link menuju /projects/:id", () => {
    const projects = [
      { id: "p1", name: "Project Alpha", slug: "alpha", status: "ACTIVE", createdAt: "2026-01-01" },
    ];
    renderSidebar("/", { projects });
    const link = screen.getByText("Project Alpha").closest("a");
    expect(link?.getAttribute("href")).toBe("/projects/p1");
  });

  test("positif: empty state menampilkan CTA saat tidak ada Project", () => {
    renderSidebar("/", { projects: [] });
    expect(screen.getByText(/Belum ada Project/)).toBeTruthy();
    expect(screen.getByText("Buat baru")).toBeTruthy();
  });

  test("positif: loading state menampilkan 'Memuat…'", () => {
    renderSidebar("/", { isLoading: true });
    expect(screen.getByText("Memuat…")).toBeTruthy();
  });
});
