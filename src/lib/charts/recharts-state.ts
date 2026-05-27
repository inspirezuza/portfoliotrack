export type RechartsMouseState = unknown;

export function getRechartsPayloadPoint<TPayload>(state: RechartsMouseState | undefined) {
  return (
    (state as { activePayload?: Array<{ payload?: TPayload }> } | undefined)?.activePayload?.[0]
      ?.payload ?? null
  );
}
