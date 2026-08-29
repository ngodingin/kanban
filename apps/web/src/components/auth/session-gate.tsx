import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { authClient } from "@/features/auth/auth-client";

// 03-ENG A.14 + 05-FRONTEND §5 — Session gate (login-first). Sebelum merender
// app shell atau memuat data domain, client web MUST menyelesaikan pemeriksaan
// session Better Auth. Saat pemeriksaan masih berjalan, UI hanya boleh
// menampilkan state loading netral—bukan shell atau data dari route tujuan.
// Session tidak ada, idle-expired, atau absolute-expired MUST mengarahkan
// pengguna ke /login.

const PUBLIC_PATHS = ["/login", "/api/auth"];

function isPublicPath(pathname: string): boolean {
  const clean = pathname.split("?")[0].split("#")[0];
  return PUBLIC_PATHS.some((p) => clean === p || clean.startsWith(p + "/"));
}

export function isSafeReturnTo(returnTo: string | null): boolean {
  if (!returnTo || returnTo.length === 0) return false;
  // Reject absolute URLs, protocol-relative, and malformed
  if (returnTo.startsWith("//") || returnTo.startsWith("http://") || returnTo.startsWith("https://")) return false;
  // Reject /api namespace (root and sub-paths), including /api?x or /api#hash
  const clean = returnTo.split("?")[0].split("#")[0];
  if (clean === "/api" || clean.startsWith("/api/")) return false;
  if (isPublicPath(returnTo)) return false;
  // Must start with / (internal path only)
  if (!returnTo.startsWith("/")) return false;
  return true;
}

export function SessionGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isPublicPath(location.pathname)) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    authClient
      .getSession({ fetchOptions: { throw: false } })
      .then((res) => {
        if (cancelled) return;
        // Better Auth client returns { data: { session, user }, error }. When no
        // valid session exists the server returns { session: null, user: null }.
        const session = res.data?.session;
        if (!session) {
          // No valid session — save returnTo and redirect to /login
          const returnTo = location.pathname;
          navigate(`/login${isSafeReturnTo(returnTo) ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`, {
            replace: true,
          });
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        navigate(`/login`, { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname, navigate]);

  if (checking) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-muted-foreground" role="status" aria-label="Memeriksa sesi">
        Memeriksa sesi...
      </div>
    );
  }

  return <>{children}</>;
}
