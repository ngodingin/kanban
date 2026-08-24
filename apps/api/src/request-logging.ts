/**
 * TASK-6.6.1 — Structured request logging (F.4): SATU baris JSON per request
 * berisi requestId/userId/projectId/action/outcome/duration. `user_id` diisi
 * oleh pipeline via AsyncLocalStorage (request-context.ts); `project_id`/`user_id` diisi
 * oleh pipeline via AsyncLocalStorage (request-context.ts).
 */
import { ulid } from "ulid";
import type { MiddlewareHandler } from "hono";
import { runWithRequestContext, getRequestLogStore } from "@kanban/infrastructure";

export interface RequestLogLine {
  request_id: string;
  user_id?: string;
  project_id?: string;
  action: string;
  outcome: string;
  duration_ms: number;
}

/** Emit satu baris JSON — titik tunggu output log (mudah diganti transport). */
/** Titik tunggu output log — semua mekanisme logging melewati fungsi ini. */
export function emitStructuredLog(obj: Record<string, unknown> | RequestLogLine): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

export function emitRequestLog(line: RequestLogLine): void {
  emitStructuredLog(line);
}


async function extractErrorCode(c: import("hono").Context): Promise<string | undefined> {
  if (c.res.status < 400) return undefined;
  try {
    const cloned = c.res.clone();
    const json = (await cloned.json()) as { error?: { code?: string } };
    return json.error?.code;
  } catch {
    return undefined;
  }
}

/** Middleware logging — pasang paling awal agar mencakup seluruh route. */
export function requestLogger(): MiddlewareHandler {
  return async (c, next) => {
    const requestId = ulid();
    const startedAt = Date.now();
    c.header("X-Request-Id", requestId);
    let store: ReturnType<typeof getRequestLogStore>;
    await runWithRequestContext({ requestId }, async () => {
      await next();
      store = getRequestLogStore();
    });
    const errorCode = await extractErrorCode(c);
    emitRequestLog({
      request_id: requestId,
      ...(store?.userId ? { user_id: store.userId } : {}),
      ...(store?.projectId ? { project_id: store.projectId } : {}),
      action: `${c.req.method} ${c.req.path}`,
      outcome: errorCode ? `${c.res.status} ${errorCode}` : String(c.res.status),
      duration_ms: Date.now() - startedAt,
    });
  };
}
