// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { LoginPage } from "../src/features/auth/login-page";
import { Sidebar } from "../src/components/layout/sidebar";

const BRAND = "Powered by NGodingiN";

function withQueryClient(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

afterEach(cleanup);

describe("TASK-7.3.3 — Branding Powered by NGodingiN di tempat yang ditentukan §5", () => {
  test("positif: layar autentikasi menampilkan branding", () => {
    const { container } = render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(container.textContent).toContain(BRAND);
  });

  test("positif: sidebar-bawah menampilkan branding", () => {
    render(
      withQueryClient(
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>,
      ),
    );
    expect(screen2()).toContain(BRAND);
    function screen2() {
      return document.body.textContent ?? "";
    }
  });

  test("negatif: konten domain (board) tidak membawa branding", () => {
    const { container } = render(
      withQueryClient(
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>,
      ),
    );
    const nav = container.querySelector("nav")!;
    expect(nav.textContent).not.toContain(BRAND);
  });
});
