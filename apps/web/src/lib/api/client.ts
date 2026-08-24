// Same-origin API client layer — TERPISAH dari UI (05-FRONTEND §3.2).
// Kontrak envelope & error: 02-SPEC C.2. Field JSON camelCase: C.2.1.
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: ReadonlyArray<{ field: string; reason: string }>;

  constructor(
    code: string,
    status: number,
    message: string,
    details?: ReadonlyArray<{ field: string; reason: string }>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// Kunci idempotensi client-generated — SATU kunci per logical action
// (02-SPEC C.3). Pemanggil menyimpan kunci ini selama action masih logis
// sama (mis. satu klik tombol + retry sadar), bukan generate ulang tiap attempt.
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  /** Wajib untuk mutation berisiko tinggi: create/move/archive/restore/delete (C.3). */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!path.startsWith("/api/v1/")) {
    throw new Error(`path API harus diawali /api/v1/: ${path}`);
  }
  const headers = new Headers({ accept: "application/json" });
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      credentials: "same-origin",
      signal: options.signal,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    // Kegagalan transport (network/abort) — kode client-only, bukan kode kanonik server.
    throw new ApiError("NETWORK_ERROR", 0, "Permintaan jaringan gagal.");
  }

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const errorShape = (payload as { error?: { code?: string; message?: string; details?: Array<{ field: string; reason: string }> } } | null)?.error;
    throw new ApiError(
      errorShape?.code ?? "INTERNAL_ERROR",
      response.status,
      errorShape?.message ?? `HTTP ${response.status}`,
      errorShape?.details,
    );
  }

  const dataShape = (payload as { data?: T } | null)?.data;
  if (dataShape === undefined) {
    throw new ApiError("INTERNAL_ERROR", response.status, "Envelope respons tidak valid.");
  }
  return dataShape;
}
