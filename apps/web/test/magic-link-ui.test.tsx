// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LoginPage } from "../src/features/auth/login-page";

const signInMagicLink = vi.fn();

vi.mock("../src/features/auth/auth-client", () => ({
  authClient: {
    signIn: {
      magicLink: (args: { email: string; callbackURL: string }) =>
        signInMagicLink(args),
    },
  },
}));

function renderLogin(initialEntry = "/login") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  signInMagicLink.mockReset();
});

describe("TASK-7.1.2 — UI Magic Link (satu form email, tanpa password/social)", () => {
  test("positif: render form email tunggal; tidak ada input password dan tombol provider", () => {
    renderLogin();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByText(/google|github|password/i)).toBeNull();
  });

  test("positif: submit email memanggil sign-in magic-link lalu tampilkan state link terkirim", async () => {
    const user = userEvent.setup();
    signInMagicLink.mockResolvedValue({ error: null });
    renderLogin();
    await user.type(screen.getByLabelText("Email"), "orang@example.com");
    await user.click(screen.getByRole("button", { name: /kirim tautan masuk/i }));
    expect(signInMagicLink).toHaveBeenCalledTimes(1);
    const arg = signInMagicLink.mock.calls[0][0] as {
      email: string;
      callbackURL: string;
    };
    expect(arg.email).toBe("orang@example.com");
    expect(arg.callbackURL).toMatch(/^http:\/\/localhost(:\d+)?\/$/);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Tautan sudah dikirim");
  });

  test("negatif: kegagalan request menampilkan pesan generik, tidak membocorkan keberadaan akun", async () => {
    const user = userEvent.setup();
    signInMagicLink.mockRejectedValue(new Error("network down"));
    renderLogin();
    await user.type(screen.getByLabelText("Email"), "tidak-ada@example.com");
    await user.click(screen.getByRole("button", { name: /kirim tautan masuk/i }));
    const alert = await screen.findByText("Terjadi kesalahan. Coba lagi.");
    expect(alert).toBeTruthy();
    // Tidak ada kalimat yang mengisyaratkan email terdaftar/tidak terdaftar.
    expect(document.body.textContent).not.toMatch(/terdaftar|belum punya akun|not found/i);
  });

  test("negatif: ?error= dari redirect verify menampilkan pesan expired/used netral", () => {
    renderLogin("/login?error=INVALID_TOKEN");
    expect(
      screen.getByText(/Tautan tidak valid atau sudah kedaluwarsa/),
    ).toBeTruthy();
  });

  test("tombol submit nonaktif saat submitting mencegah double-submit", async () => {
    const user = userEvent.setup();
    let resolveFn: (() => void) | undefined;
    signInMagicLink.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveFn = resolve;
      }),
    );
    renderLogin();
    await user.type(screen.getByLabelText("Email"), "ganda@example.com");
    const button = screen.getByRole("button", { name: /kirim tautan masuk/i });
    await user.click(button);
    expect(button.hasAttribute("disabled")).toBe(true);
    resolveFn?.();
  });
});
