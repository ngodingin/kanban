export class PipelineError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  // C.2 (amandemen 3.0.0) — VALIDATION_ERROR collect-all: field/reason per
  // field yang gagal, dikumpulkan dalam satu response alih-alih fail-fast.
  readonly details?: Array<{ field: string; reason: string }>;

  constructor(code: string, message: string, httpStatus: number, details?: Array<{ field: string; reason: string }>) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}