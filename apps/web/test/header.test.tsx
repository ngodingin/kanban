// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Header } from "../src/components/layout/header";
import { queryClient } from "../src/lib/query-client";

// QA-CL-07 remediasi: TIDAK mem-mock hook — stub global fetch sehingga
// request melewati apiRequest + envelope/field KONTRAK NYATA (C.4–C.6).
// Drift shape seperti {project}/{milestone}/{board} + name vs title kini
// tertangkap test.
function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("TASK-7.3.2 — Header breadcrumb Project › Milestone › Board + context switch", () => {
  test("positif: breadcrumb memakai nama nyata dari kontrak API ({project.name}, {milestone.title}, {board.title})", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith("/api/v1/projects")) {
        return Promise.resolve(
          jsonRes(200, {
            data: {
              projects: [
                { id: "p1", name: "Alpha" },
                { id: "p2", name: "Omega" },
              ],
            },
          }),
        );
      }
      if (String(url).endsWith("/milestones/m1/boards/b1")) {
        return Promise.resolve(
          jsonRes(200, {
            data: {
              board: {
                id: "b1",
                milestoneId: "m1",
                title: "Gamma",
                createdAt: "2026-08-01T00:00:00.000Z",
                updatedAt: "2026-08-01T00:00:00.000Z",
                archivedAt: null,
                deletedAt: null,
                version: 4,
              },
            },
          }),
        );
      }
      if (String(url).includes("/milestones/m1")) {
        return Promise.resolve(
          jsonRes(200, {
            data: {
              milestone: {
                id: "m1",
                title: "Beta",
                createdAt: "2026-08-01T00:00:00.000Z",
                updatedAt: "2026-08-01T00:00:00.000Z",
                archivedAt: null,
                deletedAt: null,
                version: 2,
              },
            },
          }),
        );
      }
      return Promise.resolve(
        jsonRes(200, {
          data: {
            project: {
              id: "p1",
              name: "Alpha",
              createdAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z",
              archivedAt: null,
              deletedAt: null,
              version: 9,
            },
          },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderHeader("/projects/p1/milestones/m1/boards/b1");
    await waitFor(() => expect(screen.getByText("Gamma")).toBeTruthy());
    const nav = screen.getByLabelText("Breadcrumb");
    expect(nav.textContent).toBe("Alpha›Beta›Gamma");
  });

  test("positif: tanpa context menampilkan brand; tanpa data → ellipsis bukan crash", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (String(url).endsWith("/api/v1/projects")) {
          return Promise.resolve(jsonRes(200, { data: { projects: [] } }));
        }
        return Promise.resolve(jsonRes(404, { error: { code: "RESOURCE_NOT_FOUND", message: "x" } }));
      }),
    );
    renderHeader("/");
    expect(screen.getByText("NGodingin Kanban")).toBeTruthy();
    expect(screen.queryByText("›")).toBeNull();
  });

  test("positif: context switch navigasi ke project terpilih", async () => {
    const user = userEvent.setup();
    let lastPath = "/projects/p1";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (String(url).endsWith("/api/v1/projects")) {
          return Promise.resolve(
            jsonRes(200, {
              data: {
                projects: [
                  { id: "p1", name: "Alpha" },
                  { id: "p2", name: "Omega" },
                ],
              },
            }),
          );
        }
        return Promise.resolve(
          jsonRes(200, {
            data: {
              project: {
                id: "p1",
                name: "Alpha",
                createdAt: "2026-08-01T00:00:00.000Z",
                updatedAt: "2026-08-01T00:00:00.000Z",
                archivedAt: null,
                deletedAt: null,
                version: 1,
              },
            },
          }),
        );
      }),
    );

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

    await waitFor(() =>
      expect((screen.getByLabelText("Pilih Project") as HTMLSelectElement).options.length).toBe(3),
    );
    await user.selectOptions(screen.getByLabelText("Pilih Project"), "p2");
    expect(lastPath).toBe("/projects/p2");
  });

  test("negatif: header tidak memuat Inbox / elemen non-MVP", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonRes(200, { data: { projects: [] } })),
    );
    const { container } = renderHeader("/");
    expect(container.textContent).not.toMatch(/inbox|revenue|analytics|billing/i);
  });
});

function LocationProbe({ onLocation }: { onLocation: (path: string) => void }) {
  const { pathname } = useLocation();
  onLocation(pathname);
  return null;
}
