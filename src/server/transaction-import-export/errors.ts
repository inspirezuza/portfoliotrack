export class TransactionImportExportError extends Error {
  readonly code:
    | "INVALID_FILE"
    | "INVALID_MODE"
    | "IMPORT_HAS_ERRORS"
    | "IMPORT_TOO_LARGE"
    | "TOO_MANY_ROWS"
    | "INTERNAL_ERROR";
  readonly details?: Record<string, unknown>;

  constructor(
    code: TransactionImportExportError["code"],
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TransactionImportExportError";
    this.code = code;
    this.details = details;
  }
}
