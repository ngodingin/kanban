export function extractSessionCookie(setCookieHeader: string): string {
  const match = setCookieHeader.match(/(?:__Secure-)?kanban\.session_token=[^;]+/);
  return match ? match[0] : "";
}
