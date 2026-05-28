import { selectVisibleTimeframePoints } from "@/components/benchmark-chart/chart-data";
import type { TimeframeKey } from "@/components/benchmark-chart/types";
import type { DashboardBenchmarkOverlay, DashboardBenchmarkQuote } from "@/server/dashboard";

const OVERLAY_COLORS = ["#3f82ff", "#8f5cf7", "#009b8e", "#d66b24", "#5965d8", "#c14f8b"];

export function getRoundedPercentAxis(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return undefined;
  }

  const min = Math.min(0, ...finiteValues);
  const max = Math.max(0, ...finiteValues);
  const spread = max - min;
  const step = spread <= 4 ? 1 : spread <= 20 ? 5 : 10;
  let lower = Math.floor(min / step) * step;
  let upper = Math.ceil(max / step) * step;

  if (lower === upper) {
    lower -= step;
    upper += step;
  }

  const ticks: number[] = [];

  for (let tick = lower; tick <= upper; tick += step) {
    ticks.push(tick);
  }

  if (!ticks.includes(0)) {
    ticks.push(0);
    ticks.sort((left, right) => left - right);
  }

  return {
    domain: [lower, upper] satisfies [number, number],
    ticks,
  };
}

export function getOverlayDataKey(symbol: string) {
  return `overlay_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

export function getComparisonColor(symbol: string, index: number, benchmarkSymbol: string | null) {
  return symbol === benchmarkSymbol ? "var(--warm)" : OVERLAY_COLORS[index % OVERLAY_COLORS.length];
}

export function getInitialSelectedComparisonSymbols(
  overlays: DashboardBenchmarkOverlay[],
  benchmarkSymbol: string | null,
) {
  return benchmarkSymbol == null ||
    !overlays.some((overlay) => overlay.symbol === benchmarkSymbol && overlay.points.length > 0)
    ? []
    : [benchmarkSymbol];
}

export function mergeOverlays(
  overlays: DashboardBenchmarkOverlay[],
  overlay: DashboardBenchmarkOverlay,
) {
  return [
    ...overlays.filter(
      (currentOverlay) => currentOverlay.providerSymbol !== overlay.providerSymbol,
    ),
    overlay,
  ];
}

export function mergeQuotes(quotes: DashboardBenchmarkQuote[], quote: DashboardBenchmarkQuote) {
  return [
    ...quotes.filter((currentQuote) => currentQuote.providerSymbol !== quote.providerSymbol),
    quote,
  ];
}

export function getVisibleOverlayPoints(
  points: DashboardBenchmarkOverlay["points"],
  timeframe: TimeframeKey,
  latestDate: string,
) {
  return selectVisibleTimeframePoints({
    anchorDate: latestDate,
    includeBaselinePoint: true,
    points,
    timeframe,
  });
}
