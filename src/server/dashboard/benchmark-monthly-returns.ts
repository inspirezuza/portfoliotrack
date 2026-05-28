import type { PortfolioBenchmarkTimeline } from "@/lib/portfolio/timeline";

export function getBenchmarkMonthKey(value: string) {
  return value.slice(0, 7);
}

export function calculateBenchmarkReturnPercent(
  startValue: number | null,
  endValue: number | null,
) {
  if (startValue == null || endValue == null || startValue <= 0) {
    return null;
  }

  return ((endValue - startValue) / startValue) * 100;
}

export function buildPortfolioMonthlyReturns(timeline: PortfolioBenchmarkTimeline) {
  const series = timeline.performanceSeries.twr;
  const pointsByMonth = new Map<string, Array<{ portfolio: number }>>();

  for (const point of series) {
    const month = getBenchmarkMonthKey(point.date);
    const monthPoints = pointsByMonth.get(month) ?? [];
    monthPoints.push({ portfolio: point.portfolioIndex });
    pointsByMonth.set(month, monthPoints);
  }

  return new Map(
    Array.from(pointsByMonth, ([month, monthPoints]) => {
      const firstPoint = monthPoints[0] ?? null;
      const lastPoint = monthPoints[monthPoints.length - 1] ?? null;

      return [
        month,
        calculateBenchmarkReturnPercent(
          firstPoint?.portfolio ?? null,
          lastPoint?.portfolio ?? null,
        ),
      ] as const;
    }),
  );
}
