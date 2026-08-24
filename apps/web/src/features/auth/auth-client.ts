import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";

// Better Auth client HANYA untuk identity/session/Magic Link (05-FRONTEND
// §3.1); authorization tetap melalui API domain /api/v1 (goal 7.1.3).
// Same-origin: base URL default mengikuti window.location.origin.
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
