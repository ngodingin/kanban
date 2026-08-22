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
