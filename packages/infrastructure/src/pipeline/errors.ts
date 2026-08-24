export class PipelineError extends Error {
    readonly code: string;
    readonly httpStatus: number;
    readonly details?: Array<{
        field: string;
        reason: string;
    }>;
    constructor(code: string, message: string, httpStatus: number, details?: Array<{
        field: string;
        reason: string;
    }>) {
        super(message);
        this.name = "PipelineError";
        this.code = code;
        this.httpStatus = httpStatus;
        this.details = details;
    }
}
