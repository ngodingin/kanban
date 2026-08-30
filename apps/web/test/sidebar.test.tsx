// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { Sidebar } from "../src/components/layout/sidebar";

function renderSidebar(path = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

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
});
