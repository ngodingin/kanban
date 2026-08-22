/**
 * Error lintas-entity untuk pelanggaran ancestor-chain
 * (INV-LIFE-001/002) — dipakai Milestone/Board/List/Card.
 */
export class AncestorNotActiveError extends Error {
  readonly code = "INVALID_STATE";
  constructor(
    public readonly operation: string,
    message: string,
  ) {
    super(message);
    this.name = "AncestorNotActiveError";
  }
}

/** INV-MOVE-001/002 + BR-018 — destination move tidak valid. */
export class InvalidDestinationError extends Error {
  readonly code = "INVALID_DESTINATION";
  constructor(message: string) {
    super(message);
    this.name = "InvalidDestinationError";
  }
}
