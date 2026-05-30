import { getUtcDateTime, isDailyPoint, isIntradayPoint } from "@/lib/charts/time-axis";

const DAY_MS = 24 * 60 * 60 * 1000;

type IntervalledPoint = {
  date: string;
  interval?: string | null;
};

/**
 * Largest-Triangle-Three-Buckets downsampling. Reduces `points` to at most
 * `threshold` items while preserving the visual shape of the line: the first
 * and last points are always kept, and within each bucket the point that forms
 * the largest triangle with its neighbours (i.e. the strongest peak/trough) is
 * the one retained. This keeps extremes that a naive "every Nth point" sample
 * would drop, so the downsampled line looks the same to the eye.
 *
 * `getValue` selects the y-dimension used to measure triangle area; x is the
 * point's UTC timestamp. Points whose value is not finite contribute 0 area.
 */
export function downsampleLttb<TPoint extends { date: string }>(
  points: TPoint[],
  threshold: number,
  getValue: (point: TPoint) => number,
): TPoint[] {
  const length = points.length;

  if (threshold >= length || threshold <= 0) {
    return points;
  }

  if (threshold <= 2) {
    return length <= 1 ? points : [points[0], points[length - 1]];
  }

  const x = (point: TPoint) => getUtcDateTime(point.date);
  const y = (point: TPoint) => {
    const value = getValue(point);

    return Number.isFinite(value) ? value : 0;
  };

  const sampled: TPoint[] = [points[0]];
  const bucketSize = (length - 2) / (threshold - 2);
  let selectedIndex = 0;

  for (let bucket = 0; bucket < threshold - 2; bucket += 1) {
    // Average the *next* bucket to anchor the triangle's far vertex.
    const nextRangeStart = Math.floor((bucket + 1) * bucketSize) + 1;
    const nextRangeEnd = Math.min(Math.floor((bucket + 2) * bucketSize) + 1, length);
    const nextRangeLength = Math.max(1, nextRangeEnd - nextRangeStart);
    let avgX = 0;
    let avgY = 0;

    for (let index = nextRangeStart; index < nextRangeEnd; index += 1) {
      avgX += x(points[index]);
      avgY += y(points[index]);
    }

    avgX /= nextRangeLength;
    avgY /= nextRangeLength;

    // Pick the point in the *current* bucket with the largest triangle area.
    const rangeStart = Math.floor(bucket * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((bucket + 1) * bucketSize) + 1, length);
    const anchorX = x(points[selectedIndex]);
    const anchorY = y(points[selectedIndex]);
    let maxArea = -1;
    let nextSelectedIndex = rangeStart;

    for (let index = rangeStart; index < rangeEnd; index += 1) {
      const area = Math.abs(
        (anchorX - avgX) * (y(points[index]) - anchorY) -
          (anchorX - x(points[index])) * (avgY - anchorY),
      );

      if (area > maxArea) {
        maxArea = area;
        nextSelectedIndex = index;
      }
    }

    sampled.push(points[nextSelectedIndex]);
    selectedIndex = nextSelectedIndex;
  }

  sampled.push(points[length - 1]);

  return sampled;
}

export type ResolutionReduceOptions = {
  /** LTTB target count for the daily (low-frequency) portion of the series. */
  dailyBudget: number;
  /**
   * Per-interval maximum age (in days, relative to the series' latest point)
   * for intraday bars. Bars older than this are dropped because no timeframe
   * ever plots them. `default` applies to any interval not listed.
   */
  intradayMaxAgeDays: Record<string, number> & { default: number };
};

function getIntradayMaxAgeDays(
  interval: string | null | undefined,
  options: ResolutionReduceOptions,
) {
  if (interval != null && interval in options.intradayMaxAgeDays) {
    return options.intradayMaxAgeDays[interval];
  }

  return options.intradayMaxAgeDays.default;
}

/**
 * Reduces a timeline series to display resolution so its serialized size is
 * bounded by what a chart can actually show, not by how long the portfolio's
 * history is.
 *
 * Two bands are treated differently:
 * - **Intraday** bars feed only the short timeframes (1D/5D/1W/1M), so we keep
 *   them at *full* resolution but only within the recent window each timeframe
 *   reads (older intraday bars are pure payload waste — no timeframe plots
 *   them). This is why zooming into a short range loses no detail.
 * - **Daily** bars feed the long timeframes, where the chart is far narrower
 *   than the point count, so we LTTB them down to `dailyBudget` — visually
 *   lossless while making the payload O(budget) instead of O(history length).
 *
 * The returned series stays sorted by time and always retains the first and
 * last daily points (LTTB endpoints) plus every kept intraday bar.
 */
export function reduceTimelineResolution<TPoint extends IntervalledPoint>(
  points: TPoint[],
  getValue: (point: TPoint) => number,
  options: ResolutionReduceOptions,
): TPoint[] {
  if (points.length === 0) {
    return points;
  }

  const dailyPoints: TPoint[] = [];
  const intradayPoints: TPoint[] = [];

  for (const point of points) {
    if (isIntradayPoint(point)) {
      intradayPoints.push(point);
    } else if (isDailyPoint(point)) {
      dailyPoints.push(point);
    } else {
      // Shouldn't happen given the interval taxonomy, but never silently drop.
      dailyPoints.push(point);
    }
  }

  // Anchor the intraday window on the series' own latest sample rather than
  // "now": the freshest bar can be hours old (markets closed), and windowing
  // against wall-clock time would wrongly drop the most recent bars.
  let latestMs = -Infinity;

  for (const point of points) {
    const timestamp = getUtcDateTime(point.date);

    if (timestamp > latestMs) {
      latestMs = timestamp;
    }
  }

  const keptIntraday = intradayPoints.filter((point) => {
    const ageDays = (latestMs - getUtcDateTime(point.date)) / DAY_MS;

    return ageDays <= getIntradayMaxAgeDays(point.interval, options);
  });
  const reducedDaily = downsampleLttb(dailyPoints, options.dailyBudget, getValue);

  return [...reducedDaily, ...keptIntraday].sort(
    (left, right) => getUtcDateTime(left.date) - getUtcDateTime(right.date),
  );
}
