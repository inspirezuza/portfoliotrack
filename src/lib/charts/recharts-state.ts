export type RechartsMouseState =
  | {
      // recharts v3 mouse-handler param (MouseHandlerDataParam)
      activeLabel?: number | string;
      activeIndex?: number | string | null;
      activeTooltipIndex?: number | string | null;
      // recharts v2 back-compat
      activePayload?: Array<{ payload?: unknown }>;
    }
  | undefined;

/**
 * Resolve the chart datum under the pointer from a recharts mouse-handler argument.
 *
 * recharts v3 changed the handler signature: instead of the old state object that
 * carried `activePayload[0].payload`, handlers now receive a `MouseHandlerDataParam`
 * that only exposes `activeIndex` / `activeLabel`. We resolve the point from the chart
 * data using those, while still honouring the legacy `activePayload` shape for safety.
 */
export function getRechartsPayloadPoint<TPoint extends { timestamp?: number }>(
  state: RechartsMouseState,
  chartData?: readonly TPoint[],
): TPoint | null {
  const legacyPayload = (state as { activePayload?: Array<{ payload?: TPoint }> } | undefined)
    ?.activePayload?.[0]?.payload;

  if (legacyPayload != null) {
    return legacyPayload;
  }

  if (chartData == null) {
    return null;
  }

  const index = state?.activeIndex ?? state?.activeTooltipIndex;

  if (typeof index === "number" && index >= 0 && index < chartData.length) {
    return chartData[index] ?? null;
  }

  const label = state?.activeLabel;

  if (label != null) {
    const timestamp = typeof label === "number" ? label : Number(label);

    if (Number.isFinite(timestamp)) {
      return chartData.find((point) => point.timestamp === timestamp) ?? null;
    }
  }

  return null;
}
