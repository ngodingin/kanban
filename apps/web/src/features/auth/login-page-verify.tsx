import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { isSafeReturnTo } from "@/components/auth/session-gate";

// 7.15.0 (CL-105/CL-106/CL-107) — Halaman perantara untuk magic link callback.
//
// Flow:
//   1. Email link → /login/verify?token=<raw>&returnTo=<path> (SPA route)
//   2. SPA load, JavaScript ekstrak token dari URL
//   3. SPA panggil GET /api/auth/magic-link/verify?token=<raw>
//   4. Server-side CL-107 intercepts Better Auth's 302 redirect and converts
//      it to 200 JSON + Set-Cookie (Vercel strips Set-Cookie from 302 only)
//   5. SPA receives 200 JSON, cookie is set, redirect client-side ke returnTo

export function LoginPageVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get("token");
    const returnTo = searchParams.get("returnTo");
    const error = searchParams.get("error");

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

    fetch(`/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`, {
      credentials: "include",
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          navigate("/login?error=INVALID_TOKEN", { replace: true });
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        // CL-107: server mengembalikan 200 JSON dengan { verified, redirectTo }.
        // Cookie sudah di-set oleh response 200 (bukan 302 yang di-strip Vercel).
        // Gunakan redirectTo dari server jika ada, fallback ke safeReturnTo.
        const dest = data?.redirectTo && isSafeReturnTo(data.redirectTo)
          ? data.redirectTo
          : safeReturnTo;
        navigate(dest, { replace: true });
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

  return (
    <main className="flex min-h-svh items-center justify-center bg-background text-muted-foreground" role="status" aria-label="Memverifikasi tautan">
      Memverifikasi tautan...
    </main>
  );
}
