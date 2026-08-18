export class PipelineError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}