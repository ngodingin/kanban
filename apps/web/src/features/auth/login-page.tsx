import { type FormEvent, useState } from "react";
import { useSearchParams } from "react-router";
import { authClient } from "./auth-client";

// 05-FRONTEND §5 — satu form email untuk meminta Magic Link. UI menangani
// state request, link terkirim, expired/used link (via ?error= hasil redirect
// verify), dan error — tanpa membocorkan keberadaan akun. Tidak ada form
// password atau halaman register terpisah pada MVP (03-ENG A.14).
const PESAN_TAUTAN = "Tautan sudah dikirim ke email Anda. Periksa kotak masuk Anda.";
const PESAN_LINK_KADALUARSA =
  "Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru di bawah.";
const PESAN_ERROR = "Terjadi kesalahan. Coba lagi.";

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">(
    "idle",
  );

  const linkError = searchParams.get("error");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    try {
      await authClient.signIn.magicLink({
        email,
        callbackURL: `${window.location.origin}/`,
      });
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">
          Masuk ke NGodingin Kanban
        </h1>
        {status === "sent" ? (
          <p role="status">{PESAN_TAUTAN}</p>
        ) : (
          <form onSubmit={onSubmit} aria-label="Form Magic Link" noValidate>
            {linkError ? <p className="mb-4 text-destructive">{PESAN_LINK_KADALUARSA}</p> : null}
            {status === "error" ? <p className="mb-4 text-destructive">{PESAN_ERROR}</p> : null}
            <label htmlFor="email" className="mb-2 block text-sm text-muted-foreground">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-4 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={status === "submitting" || email.length === 0}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {status === "submitting" ? "Mengirim..." : "Kirim tautan masuk"}
            </button>
          </form>
        )}
        <p className="mt-8 text-xs text-muted-foreground">Powered by NGodingiN</p>
      </div>
    </main>
  );
}
