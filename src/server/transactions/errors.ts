export class InstrumentServiceError extends Error {
  readonly code: "VALIDATION_ERROR" | "DUPLICATE_INSTRUMENT" | "INTERNAL_ERROR";
  readonly details?: Record<string, unknown>;

  constructor(
    code: InstrumentServiceError["code"],
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "InstrumentServiceError";
    this.code = code;
    this.details = details;
  }
}

export class TransactionServiceError extends Error {
  readonly code:
    | "VALIDATION_ERROR"
    | "INSTRUMENT_NOT_FOUND"
    | "TRANSACTION_NOT_FOUND"
    | "INSUFFICIENT_QUANTITY"
    | "INTERNAL_ERROR";
  readonly details?: Record<string, unknown>;

  constructor(
    code: TransactionServiceError["code"],
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TransactionServiceError";
    this.code = code;
    this.details = details;
  }
}
