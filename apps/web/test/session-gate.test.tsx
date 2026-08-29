// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { isSafeReturnTo } from "../src/components/auth/session-gate";

const mockGetSession = vi.fn();

vi.mock("../src/features/auth/auth-client", () => ({
  authClient: {
    getSession: (...args: unknown[]) => mockGetSession(...args),
  },
}));

afterEach(() => {
  cleanup();
  mockGetSession.mockReset();
});

describe("isSafeReturnTo — returnTo validation", () => {
  test("rejects null/empty", () => {
    expect(isSafeReturnTo(null)).toBe(false);
    expect(isSafeReturnTo("")).toBe(false);
  });

  test("rejects protocol-relative URLs", () => {
    expect(isSafeReturnTo("//evil.com")).toBe(false);
  });

  test("rejects absolute HTTP/HTTPS URLs", () => {
    expect(isSafeReturnTo("https://evil.com/phish")).toBe(false);
    expect(isSafeReturnTo("http://evil.com/phish")).toBe(false);
  });

  test("rejects /api/ paths", () => {
    expect(isSafeReturnTo("/api/v1/projects")).toBe(false);
    expect(isSafeReturnTo("/api/auth/callback")).toBe(false);
  });

  test("rejects public/auth paths including query params", () => {
    expect(isSafeReturnTo("/login")).toBe(false);
    expect(isSafeReturnTo("/login?foo=bar")).toBe(false);
  });

  test("rejects non-/ paths (malformed)", () => {
    expect(isSafeReturnTo("evil.com")).toBe(false);
    expect(isSafeReturnTo("projects/123")).toBe(false);
  });

  test("accepts valid internal paths", () => {
    expect(isSafeReturnTo("/projects/abc123")).toBe(true);
    expect(isSafeReturnTo("/projects/abc/milestones/def/boards/ghi")).toBe(true);
    expect(isSafeReturnTo("/")).toBe(true);
  });
});

// Lazy import to get the SessionGate after mocks are set up
async function importSessionGate() {
  const mod = await import("../src/components/auth/session-gate");
  return mod.SessionGate;
}

describe("TASK-7.15.1 — SessionGate: session check gating", () => {
  // Better Auth client returns { data: { session, user }, error } shape.
  function sessionResponse(session: unknown, user: unknown) {
    return { data: { session, user }, error: null };
  }

  test("positif: /login route skips session check (public)", async () => {
    const SessionGate = await importSessionGate();
    mockGetSession.mockResolvedValue(sessionResponse(null, null));
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <SessionGate>
          <div data-testid="app-content">App Content</div>
        </SessionGate>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("app-content")).toBeTruthy();
    });
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  test("positif: menampilkan loading netral saat checking", async () => {
    const SessionGate = await importSessionGate();
    let resolveSession: ((v: unknown) => void) | undefined;
    mockGetSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    render(
      <MemoryRouter initialEntries={["/projects/p1"]}>
        <SessionGate>
          <div data-testid="app-content">App Content</div>
        </SessionGate>
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/Memeriksa sesi/)).toBeTruthy();
    expect(screen.queryByTestId("app-content")).toBeNull();
    resolveSession!(sessionResponse({ id: "s1" }, { id: "u1" }));
    await waitFor(() => {
      expect(screen.getByTestId("app-content")).toBeTruthy();
    });
  });

  test("positif: session valid → children render", async () => {
    const SessionGate = await importSessionGate();
    mockGetSession.mockResolvedValue(
      sessionResponse({ id: "s1", expiresAt: Date.now() + 3600_000 }, { id: "u1" }),
    );
    render(
      <MemoryRouter initialEntries={["/projects/p1"]}>
        <SessionGate>
          <div data-testid="app-content">App Content</div>
        </SessionGate>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("app-content")).toBeTruthy();
    });
  });

  test("positif: session tidak ada → children tidak render (navigate ke /login)", async () => {
    const SessionGate = await importSessionGate();
    mockGetSession.mockResolvedValue(sessionResponse(null, null));
    render(
      <MemoryRouter initialEntries={["/projects/p1"]}>
        <SessionGate>
          <div data-testid="app-content">App Content</div>
        </SessionGate>
      </MemoryRouter>,
    );
    // Children should NOT render — redirect to /login
    await waitFor(() => {
      expect(screen.queryByTestId("app-content")).toBeNull();
    });
    expect(mockGetSession).toHaveBeenCalled();
  });

  test("positif: session error → children tidak render (navigate ke /login)", async () => {
    const SessionGate = await importSessionGate();
    mockGetSession.mockRejectedValue(new Error("network"));
    render(
      <MemoryRouter initialEntries={["/projects/p1"]}>
        <SessionGate>
          <div data-testid="app-content">App Content</div>
        </SessionGate>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.queryByTestId("app-content")).toBeNull();
    });
  });
});
