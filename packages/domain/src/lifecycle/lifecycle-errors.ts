export class AncestorNotActiveError extends Error {
    readonly code = "INVALID_STATE";
    readonly operation: string;
    constructor(operation: string, message: string) {
        super(message);
        this.operation = operation;
        this.name = "AncestorNotActiveError";
    }
}
export class InvalidDestinationError extends Error {
    readonly code = "INVALID_DESTINATION";
    constructor(message: string) {
        super(message);
        this.name = "InvalidDestinationError";
    }
}
