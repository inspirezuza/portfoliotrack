export class OperationTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms.`);
    this.name = "OperationTimeoutError";
  }
}

export function withOperationTimeout<T>(
  operation: Promise<T>,
  {
    label,
    timeoutMs
  }: {
    label: string;
    timeoutMs: number;
  }
) {
  if (timeoutMs <= 0) {
    return operation;
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new OperationTimeoutError(label, timeoutMs));
    }, timeoutMs);
  });

  operation.catch(() => {
    // Avoid an unhandled rejection if the timeout wins the race first.
  });

  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }
  });
}
