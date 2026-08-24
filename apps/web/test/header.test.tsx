// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Header } from "../src/components/layout/header";
import { queryClient } from "../src/lib/query-client";

const mocks = vi.hoisted(() => ({
  useProjects: vi.fn(),
  useProject: vi.fn(),
  useMilestone: vi.fn(),
  useBoard: vi.fn(),
}));

vi.mock("../src/features/projects/hooks", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/features/projects/hooks")>();
  return {
    ...mod,
    useProjects: mocks.useProjects,
    useProject: mocks.useProject,
    useMilestone: mocks.useMilestone,
    useBoard: mocks.useBoard,
  };
});

function idleQuery<T>(data: T | undefined, isLoading = false) {
  return { data, isLoading, error: null } as ReturnType<
    typeof mocks.useProject
  >;
}

function renderHeader(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/" element={<Header />} />
          <Route path="/projects/:projectId" element={<Header />} />
          <Route
            path="/projects/:projectId/milestones/:milestoneId"
            element={<Header />}
          />
          <Route
            path="/projects/:projectId/milestones/:milestoneId/boards/:boardId"
            element={<Header />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  for (const fn of Object.values(mocks)) fn.mockReset();
});

describe("TASK-7.3.2 — Header breadcrumb Project › Milestone › Board + context switch", () => {
  test("positif: breadcrumb akurat mengikuti params dengan nama dari API", () => {
    mocks.useProjects.mockReturnValue(idleQuery({ projects: [] }));
    mocks.useProject.mockReturnValue(idleQuery({ id: "p1", name: "Alpha" }));
    mocks.useMilestone.mockReturnValue(idleQuery({ id: "m1", name: "Beta" }));
    mocks.useBoard.mockReturnValue(idleQuery({ id: "b1", name: "Gamma" }));

    renderHeader("/projects/p1/milestones/m1/boards/b1");
    const nav = screen.getByLabelText("Breadcrumb");
    expect(nav.textContent).toBe("Alpha›Beta›Gamma");
  });

  test("positif: tanpa context Project menampilkan brand saja", () => {
    mocks.useProjects.mockReturnValue(idleQuery({ projects: [] }));
    mocks.useProject.mockReturnValue(idleQuery(undefined));
    mocks.useMilestone.mockReturnValue(idleQuery(undefined));
    mocks.useBoard.mockReturnValue(idleQuery(undefined));
    renderHeader("/");
    expect(screen.getByText("NGodingin Kanban")).toBeTruthy();
    expect(screen.queryByText("›")).toBeNull();
  });

  test("positif: context switch navigasi ke project terpilih", async () => {
    const user = userEvent.setup();
    mocks.useProjects.mockReturnValue(
      idleQuery({
        projects: [
          { id: "p1", name: "Alpha" },
          { id: "p2", name: "Omega" },
        ],
      }),
    );
    mocks.useProject.mockReturnValue(idleQuery({ id: "p1", name: "Alpha" }));
    mocks.useMilestone.mockReturnValue(idleQuery(undefined));
    mocks.useBoard.mockReturnValue(idleQuery(undefined));

    let lastPath = "/projects/p1";
    render(
      <MemoryRouter initialEntries={["/projects/p1"]}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route
              path="/projects/:projectId"
              element={
                <>
                  <Header />
                  <LocationProbe onLocation={(p) => (lastPath = p)} />
                </>
              }
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await user.selectOptions(screen.getByLabelText("Pilih Project"), "p2");
    expect(lastPath).toBe("/projects/p2");
  });

  test("negatif: header tidak memuat Inbox / elemen non-MVP", () => {
    mocks.useProjects.mockReturnValue(idleQuery({ projects: [] }));
    mocks.useProject.mockReturnValue(idleQuery(undefined));
    mocks.useMilestone.mockReturnValue(idleQuery(undefined));
    mocks.useBoard.mockReturnValue(idleQuery(undefined));
    const { container } = renderHeader("/");
    expect(container.textContent).not.toMatch(/inbox|revenue|analytics|billing/i);
  });
});

function LocationProbe({ onLocation }: { onLocation: (path: string) => void }) {
  const { pathname } = useLocation();
  onLocation(pathname);
  return null;
}
