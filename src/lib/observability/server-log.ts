type LogLevel = "info" | "warn" | "error";

type ServerLogInput = {
  context?: Record<string, unknown>;
  error?: unknown;
  event: string;
  level: LogLevel;
  message: string;
};

type SerializedError = {
  message: string;
  name: string;
  stack?: string;
};

function compactContext(context: Record<string, unknown> | undefined) {
  if (context == null) {
    return undefined;
  }

  const compacted = Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined),
  );

  return Object.keys(compacted).length === 0 ? undefined : compacted;
}

function serializeError(error: unknown): SerializedError | undefined {
  if (error == null) {
    return undefined;
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
    name: "NonError",
  };
}

export function buildServerLogEvent(input: ServerLogInput, now = new Date()) {
  return {
    context: compactContext(input.context),
    error: serializeError(input.error),
    event: input.event,
    level: input.level,
    message: input.message,
    timestamp: now.toISOString(),
  };
}

function writeServerLog(input: ServerLogInput) {
  const event = buildServerLogEvent(input);
  const line = JSON.stringify(event);

  if (input.level === "error") {
    console.error(line);
    return;
  }

  if (input.level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function logServerError(
  event: string,
  message: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  writeServerLog({ context, error, event, level: "error", message });
}

export function logServerWarn(event: string, message: string, context?: Record<string, unknown>) {
  writeServerLog({ context, event, level: "warn", message });
}
