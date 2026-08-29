import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { isSafeReturnTo } from "@/components/auth/session-gate";

// 7.15.0 (CL-105/CL-106) — Halaman perantara untuk magic link callback.
//
// Vercel CDN men-strip header Set-Cookie dari response 302 redirect. Solusi:
// guardedSendMagicLink (auth.ts) me-rewrite URL email ke /login/verify (route
// SPA), bukan ke endpoint API. Token hanya dikonsumsi SEKALI:
//
//   1. Email link → /login/verify?token=<raw>&returnTo=<path> (SPA route)
//   2. SPA load, JavaScript ekstrak token dari URL
//   3. SPA panggil GET /api/auth/magic-link/verify?token=<raw> (tanpa callbackURL)
//      → response 200 JSON + Set-Cookie → cookie TERSET (200, bukan 302)
//   4. Redirect client-side ke returnTo (sudah punya session valid)

export function LoginPageVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"verifying" | "error">("verifying");

  useEffect(() => {
    const token = searchParams.get("token");
    const returnTo = searchParams.get("returnTo");
    const error = searchParams.get("error");

    // Better Auth mengirim error param saat token invalid/expired (302 redirect
    // ke callbackURL dengan ?error=INVALID_TOKEN). Vercel strips Set-Cookie dari
    // 302, tapi redirect itu sendiri tetap sampai. Route ini menangkap error dan
    // mengarahkan ke /login dengan pesan yang sesuai.
    if (error) {
      navigate(`/login?error=${encodeURIComponent(error)}`, { replace: true });
      return;
    }

    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    const safeReturnTo = isSafeReturnTo(returnTo) ? returnTo! : "/";

    let cancelled = false;

    // Panggil verify TANPA callbackURL → response 200 JSON + Set-Cookie.
    // Cookie TERSET karena response 200 (bukan 302 redirect yang di-strip Vercel).
    fetch(`/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`, {
      credentials: "include",
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          // Token invalid, expired, atau sudah dipakai → redirect ke login
          navigate("/login?error=INVALID_TOKEN", { replace: true });
          return;
        }
        // Verify sukses — Set-Cookie sudah di-set oleh response 200.
        // Sekarang redirect client-side ke tujuan asli.
        setStatus("verifying");
        navigate(safeReturnTo, { replace: true });
      })
      .catch(() => {
        if (!cancelled) {
          navigate("/login", { replace: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate]);

  if (status === "error") {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-sm text-center">
          <p className="text-destructive">Verifikasi gagal. Minta tautan baru.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background text-muted-foreground" role="status" aria-label="Memverifikasi tautan">
      Memverifikasi tautan...
    </main>
  );
}
