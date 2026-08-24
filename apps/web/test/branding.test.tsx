// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { LoginPage } from "../src/features/auth/login-page";
import { Sidebar } from "../src/components/layout/sidebar";

const BRAND = "Powered by NGodingiN";

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
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen2()).toContain(BRAND);
    function screen2() {
      return document.body.textContent ?? "";
    }
  });

  test("negatif: konten domain (board) tidak membawa branding", () => {
    // Kolom board tidak merender branding — hanya sidebar/footer/auth.
    const { container } = render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    const nav = container.querySelector("nav")!;
    expect(nav.textContent).not.toContain(BRAND);
  });
});
