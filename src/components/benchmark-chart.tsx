"use client";

import { useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatPercentRatio } from "@/lib/format";
import {
  attachTimeAxis,
  buildTimeAxisTicks,
  formatTimeAxisTick,
  getTimeAxisDomain,
  getUtcDateTime,
  isDailyPoint,
  isIntradayDate,
  isIntradayPoint,
  parseChartDate,
  type TimeAxisPoint,
} from "@/lib/charts/time-axis";
import { useChartVisibilityKey } from "@/hooks/use-chart-visibility-key";
import {
  BenchmarkComparisonPicker,
  type BenchmarkComparisonPickerItem,
} from "@/components/benchmark-comparison-picker";
import type {
  BenchmarkComparisonBasis,
  BenchmarkTimelinePoint,
  PortfolioBenchmarkTimelineStatus,
} from "@/lib/portfolio/timeline";
import type { DashboardBenchmarkOverlay, DashboardBenchmarkQuote } from "@/server/dashboard";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";

type BenchmarkChartProps = {
  absoluteSeries: BenchmarkTimelinePoint[];
  benchmarkOverlays: DashboardBenchmarkOverlay[];
  benchmarkQuotes: DashboardBenchmarkQuote[];
  benchmarkSymbol: string | null;
  benchmarkCurrency: string | null;
  comparisonBasis: BenchmarkComparisonBasis | null;
  language: UiLanguage;
  moneyWeightedSeries: BenchmarkTimelinePoint[];
  performanceSummary: BenchmarkPerformanceSummary;
  portfolioCurrency: string | null;
  series: BenchmarkTimelinePoint[];
  status: PortfolioBenchmarkTimelineStatus;
};

type BenchmarkPerformanceSummary = {
  status:
    | "ready"
    | "no-transactions"
    | "mixed-currency"
    | "missing-market-value"
    | "no-positive-net-invested";
  currency: string | null;
  totalPnl: number | null;
  netInvested: number | null;
  absoluteReturn: number | null;
};

type TimeframeKey = "1D" | "5D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";
type PerformanceMode = "INDEXED" | "GAP" | "DRAWDOWN";
type ReturnBasis = "TWR" | "MWR" | "ABSOLUTE";

type ChartPoint = BenchmarkTimelinePoint &
  TimeAxisPoint & {
    benchmarkChangeFromRangeStart: number | null;
    benchmarkDisplay: number;
    benchmarkDrawdown: number;
    benchmarkReturn: number;
    gap: number;
    portfolioDisplay: number;
    portfolioChangeFromRangeStart: number | null;
    portfolioDrawdown: number;
    portfolioReturn: number;
  } & Record<string, number | null | string | undefined>;

type ChartMouseState = {
  activePayload?: Array<{
    payload?: ChartPoint;
  }>;
};

type SelectionRange = {
  startDate: string;
  endDate: string;
};

type BenchmarkChartTooltipProps = {
  active?: boolean;
  label?: number;
  payload?: Array<{
    dataKey?: string;
    name?: string;
    payload?: ChartPoint;
    value?: number;
  }>;
};

const TIMEFRAME_OPTIONS: TimeframeKey[] = ["1D", "5D", "1W", "1M", "3M", "YTD", "1Y", "ALL"];

const PERFORMANCE_MODE_OPTIONS: PerformanceMode[] = ["INDEXED", "GAP", "DRAWDOWN"];
const RETURN_BASIS_OPTIONS: ReturnBasis[] = ["TWR", "MWR", "ABSOLUTE"];
const OVERLAY_COLORS = ["#3f82ff", "#8f5cf7", "#009b8e", "#d66b24", "#5965d8", "#c14f8b"];

function formatChartDate(value: string, locale: string) {
  const hasTime = isIntradayDate(value);

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "UTC",
  }).format(parseChartDate(value));
}

function formatIndexedReturn(value: number, locale: string) {
  return formatPercentRatio(value / 100, {
    locale,
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPercentagePoint(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} pp`;
}

function formatPerformanceMoney(value: number | null, currency: string | null, locale: string) {
  if (value == null || currency == null) {
    return "-";
  }

  return formatCurrency(value, { currency, locale });
}

function formatAbsoluteReturn(value: number | null, locale: string) {
  if (value == null) {
    return "-";
  }

  return formatPercentRatio(value, {
    locale,
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
}

function formatModeValue(value: number, mode: PerformanceMode, locale: string) {
  if (mode === "INDEXED") {
    return formatIndexedReturn(value, locale);
  }

  return mode === "GAP" ? formatPercentagePoint(value) : formatSignedPercent(value);
}

function getBasisLabel({
  benchmarkCurrency,
  comparisonBasis,
  portfolioCurrency,
  copy,
}: {
  benchmarkCurrency: string | null;
  comparisonBasis: BenchmarkComparisonBasis | null;
  portfolioCurrency: string | null;
  copy: ReturnType<typeof getUiCopy>["charts"]["benchmark"];
}) {
  if (comparisonBasis === "same-currency") {
    return portfolioCurrency == null
      ? copy.basis.sameCurrencyFallback
      : copy.basis.sameCurrency(portfolioCurrency);
  }

  if (comparisonBasis === "native-currency-return") {
    return benchmarkCurrency == null
      ? copy.basis.nativeCurrencyFallback
      : copy.basis.nativeCurrency(benchmarkCurrency);
  }

  return copy.basis.performanceReturn;
}

function getAbsoluteSummaryMessage({
  copy,
  status,
}: {
  copy: ReturnType<typeof getUiCopy>["charts"]["benchmark"];
  status: BenchmarkPerformanceSummary["status"];
}) {
  switch (status) {
    case "mixed-currency":
      return copy.absoluteSummary.unavailable.mixedCurrency;
    case "missing-market-value":
      return copy.absoluteSummary.unavailable.missingMarketValue;
    case "no-positive-net-invested":
      return copy.absoluteSummary.unavailable.noPositiveNetInvested;
    case "no-transactions":
      return copy.absoluteSummary.unavailable.noTransactions;
    default:
      return null;
  }
}

function getValueClassName(value: number | null) {
  if (value == null || value === 0) {
    return "";
  }

  return value > 0 ? "value-positive" : "value-negative";
}

function getSeriesChangeValue(
  point: ChartPoint,
  key: "portfolio" | "benchmark",
  mode: PerformanceMode,
) {
  if (mode === "GAP") {
    return key === "portfolio" ? point.gap : 0;
  }

  if (mode === "DRAWDOWN") {
    return key === "portfolio" ? point.portfolioDrawdown : point.benchmarkDrawdown;
  }

  return key === "portfolio" ? point.portfolioReturn : point.benchmarkReturn;
}

function formatSeriesChange(value: number, mode: PerformanceMode) {
  return mode === "GAP" ? formatPercentagePoint(value) : formatSignedPercent(value);
}

function formatSeriesPointValue(value: number, mode: PerformanceMode, locale: string) {
  return formatModeValue(value, mode, locale);
}

function getUnavailableMessage({
  benchmarkSymbol,
  copy,
  portfolioCurrency,
  returnBasis,
  status,
}: {
  benchmarkSymbol: string | null;
  copy: ReturnType<typeof getUiCopy>["charts"]["benchmark"];
  portfolioCurrency: string | null;
  returnBasis: ReturnBasis;
  status: PortfolioBenchmarkTimelineStatus;
}) {
  if (status === "ready" && returnBasis === "ABSOLUTE") {
    return copy.unavailable.missingAbsoluteReturn;
  }

  switch (status) {
    case "no-transactions":
      return copy.unavailable.noTransactions;
    case "mixed-currency":
      return copy.unavailable.mixedCurrency;
    case "missing-portfolio-history":
      return copy.unavailable.missingPortfolioHistory;
    case "benchmark-currency-mismatch":
      return benchmarkSymbol == null || portfolioCurrency == null
        ? copy.unavailable.currencyMismatchFallback
        : copy.unavailable.currencyMismatch(benchmarkSymbol, portfolioCurrency);
    case "missing-benchmark-history":
      return benchmarkSymbol == null
        ? copy.unavailable.missingBenchmarkFallback
        : copy.unavailable.missingBenchmarkHistory(benchmarkSymbol);
    default:
      return copy.unavailable.default;
  }
}

function getTimeframeStartDate(key: TimeframeKey, latestDate: string) {
  const latest = parseChartDate(latestDate);

  if (key === "ALL") {
    return null;
  }

  if (key === "YTD") {
    return `${latest.getUTCFullYear()}-01-01T00:00:00.000Z`;
  }

  const daysByKey: Record<Exclude<TimeframeKey, "ALL" | "YTD">, number> = {
    "1D": 1,
    "5D": 5,
    "1W": 7,
    "1M": 30,
    "3M": 90,
    "1Y": 365,
  };
  latest.setUTCDate(latest.getUTCDate() - daysByKey[key]);

  return latest.toISOString();
}

function isShortTimeframe(timeframe: TimeframeKey) {
  return timeframe === "1D" || timeframe === "5D" || timeframe === "1W" || timeframe === "1M";
}

function getPreferredIntradayInterval(timeframe: TimeframeKey) {
  if (timeframe === "1D") {
    return "5m";
  }

  if (timeframe === "5D" || timeframe === "1W" || timeframe === "1M") {
    return "1h";
  }

  return null;
}

function getVisibleSeries(series: BenchmarkTimelinePoint[], timeframe: TimeframeKey) {
  const latestPoint = series[series.length - 1];

  if (latestPoint == null) {
    return [];
  }

  const startDate = getTimeframeStartDate(timeframe, latestPoint.date);
  const startTime = startDate == null ? null : getUtcDateTime(startDate);
  const filteredSeries =
    startTime == null ? series : series.filter((point) => getUtcDateTime(point.date) >= startTime);

  if (isShortTimeframe(timeframe)) {
    const preferredInterval = getPreferredIntradayInterval(timeframe);
    const preferredIntradaySeries = filteredSeries.filter(
      (point) => preferredInterval != null && point.interval === preferredInterval,
    );

    if (preferredIntradaySeries.length >= 2) {
      return preferredIntradaySeries;
    }

    const intradaySeries = filteredSeries.filter(isIntradayPoint);

    if (intradaySeries.length >= 2) {
      return intradaySeries;
    }
  } else {
    const dailySeries = filteredSeries.filter(isDailyPoint);

    if (dailySeries.length >= 2) {
      return dailySeries;
    }
  }

  return filteredSeries.length > 0 ? filteredSeries : series;
}

function calculatePercentChange(startValue: number, endValue: number) {
  if (startValue === 0) {
    return null;
  }

  return ((endValue - startValue) / startValue) * 100;
}

function getRoundedPercentAxis(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return undefined;
  }

  const min = Math.min(0, ...finiteValues);
  const max = Math.max(0, ...finiteValues);
  const spread = max - min;
  const step = Math.max(10, Math.ceil(Math.max(spread, 10) / 80) * 10);
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

function getOverlayDataKey(symbol: string) {
  return `overlay_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

function getPointTimestamp(point: { date: string }) {
  return getUtcDateTime(point.date);
}

function getPointValueAtOrBefore(
  points: Array<{ date: string; value: number }>,
  targetDate: string,
) {
  const targetTime = getUtcDateTime(targetDate);
  let value: number | null = null;

  for (const point of points) {
    if (getPointTimestamp(point) > targetTime) {
      break;
    }

    value = point.value;
  }

  return value;
}

function getVisibleOverlayPoints(
  points: DashboardBenchmarkOverlay["points"],
  timeframe: TimeframeKey,
  latestDate: string,
) {
  const startDate = getTimeframeStartDate(timeframe, latestDate);
  const startTime = startDate == null ? null : getUtcDateTime(startDate);
  const filteredPoints =
    startTime == null ? points : points.filter((point) => getUtcDateTime(point.date) >= startTime);

  if (isShortTimeframe(timeframe)) {
    const preferredInterval = getPreferredIntradayInterval(timeframe);
    const preferredIntradayPoints = filteredPoints.filter(
      (point) => preferredInterval != null && point.interval === preferredInterval,
    );

    if (preferredIntradayPoints.length >= 2) {
      return preferredIntradayPoints;
    }

    return filteredPoints.filter(isIntradayPoint);
  }

  const dailyPoints = filteredPoints.filter(isDailyPoint);

  return dailyPoints.length >= 2 ? dailyPoints : filteredPoints;
}

function getOverlayReturnAtDate(
  points: DashboardBenchmarkOverlay["points"],
  startDate: string,
  targetDate: string,
) {
  const startValue = getPointValueAtOrBefore(points, startDate);
  const currentValue = getPointValueAtOrBefore(points, targetDate);

  return startValue == null || currentValue == null
    ? null
    : calculatePercentChange(startValue, currentValue);
}

function getSelectionPoints(data: ChartPoint[], selection: SelectionRange | null) {
  if (selection == null) {
    return null;
  }

  const startTime = getUtcDateTime(selection.startDate);
  const endTime = getUtcDateTime(selection.endDate);
  const minTime = Math.min(startTime, endTime);
  const maxTime = Math.max(startTime, endTime);
  const startPoint = data.find((point) => getUtcDateTime(point.date) === minTime) ?? null;
  const endPoint = data.find((point) => getUtcDateTime(point.date) === maxTime) ?? null;

  if (startPoint == null || endPoint == null) {
    return null;
  }

  return {
    startPoint,
    endPoint,
  };
}

function hasSelectionSpan(points: ReturnType<typeof getSelectionPoints>) {
  return points != null && points.startPoint.date !== points.endPoint.date;
}

function getChartPoint(state: ChartMouseState | undefined) {
  return state?.activePayload?.[0]?.payload ?? null;
}

function BenchmarkChartTooltip({
  active,
  label,
  language,
  mode,
  payload,
}: BenchmarkChartTooltipProps & {
  language: UiLanguage;
  mode: PerformanceMode;
}) {
  const point = payload?.[0]?.payload;
  const locale = getUiLocale(language);

  if (!active || point == null || label == null) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <span>{formatChartDate(point.date, locale)}</span>
      {payload?.map((item) => {
        const value = item.value;

        if (value == null || item.dataKey == null) {
          return null;
        }

        const change =
          item.dataKey === "portfolioDisplay"
            ? point.portfolioChangeFromRangeStart
            : item.dataKey === "benchmarkDisplay"
              ? point.benchmarkChangeFromRangeStart
              : null;

        return (
          <div className="chart-tooltip-row" key={item.dataKey}>
            <span>{item.name ?? item.dataKey}</span>
            <strong>{formatModeValue(value, mode, locale)}</strong>
            {mode !== "INDEXED" || change == null ? null : (
              <em className={change >= 0 ? "value-positive" : "value-negative"}>
                {formatSignedPercent(change)}
              </em>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BenchmarkChart({
  absoluteSeries,
  benchmarkOverlays,
  benchmarkQuotes,
  benchmarkSymbol,
  benchmarkCurrency,
  comparisonBasis,
  language,
  moneyWeightedSeries,
  performanceSummary,
  portfolioCurrency,
  series,
  status,
}: BenchmarkChartProps) {
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);
  const [timeframe, setTimeframe] = useState<TimeframeKey>("ALL");
  const [returnBasis, setReturnBasis] = useState<ReturnBasis>("TWR");
  const [mode, setMode] = useState<PerformanceMode>("INDEXED");
  const [hoverPoint, setHoverPoint] = useState<ChartPoint | null>(null);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [selectedComparisonSymbols, setSelectedComparisonSymbols] = useState<string[]>([]);
  const isDraggingRef = useRef(false);
  const { chartContainerRef, chartRenderKey } = useChartVisibilityKey();
  const activeSeries =
    returnBasis === "ABSOLUTE"
      ? absoluteSeries
      : returnBasis === "MWR"
        ? moneyWeightedSeries
        : series;
  const hasSeries = activeSeries.length > 0;
  const hasAnySeries =
    series.length > 0 || absoluteSeries.length > 0 || moneyWeightedSeries.length > 0;
  const returnBasisCopy = copy.charts.benchmark.returnBasis[returnBasis];
  const absoluteSummaryMessage = getAbsoluteSummaryMessage({
    copy: copy.charts.benchmark,
    status: performanceSummary.status,
  });
  const shouldShowAbsoluteSummary = performanceSummary.status !== "no-transactions";
  const visibleSeries = useMemo(
    () => getVisibleSeries(activeSeries, timeframe),
    [activeSeries, timeframe],
  );
  const comparisonOverlays = useMemo(
    () =>
      benchmarkOverlays.filter(
        (overlay) => overlay.symbol !== benchmarkSymbol && overlay.points.length > 0,
      ),
    [benchmarkOverlays, benchmarkSymbol],
  );
  const selectedOverlays = useMemo(
    () =>
      selectedComparisonSymbols
        .map((symbol) => comparisonOverlays.find((overlay) => overlay.symbol === symbol) ?? null)
        .filter((overlay): overlay is DashboardBenchmarkOverlay => overlay != null),
    [comparisonOverlays, selectedComparisonSymbols],
  );
  const visibleOverlayPointsBySymbol = useMemo(() => {
    const latestPoint = visibleSeries[visibleSeries.length - 1] ?? null;

    if (latestPoint == null) {
      return new Map<string, DashboardBenchmarkOverlay["points"]>();
    }

    return new Map(
      comparisonOverlays.map((overlay) => [
        overlay.symbol,
        getVisibleOverlayPoints(overlay.points, timeframe, latestPoint.date),
      ]),
    );
  }, [comparisonOverlays, timeframe, visibleSeries]);
  const basisReturn = useMemo(() => {
    const firstPoint = visibleSeries[0] ?? null;
    const latestPoint = visibleSeries[visibleSeries.length - 1] ?? null;

    if (firstPoint == null || latestPoint == null) {
      return null;
    }

    return calculatePercentChange(firstPoint.portfolio, latestPoint.portfolio);
  }, [visibleSeries]);
  const chartData = useMemo<ChartPoint[]>(() => {
    const firstPoint = visibleSeries[0] ?? null;
    let portfolioHighWatermark = firstPoint?.portfolio ?? 100;
    let benchmarkHighWatermark = firstPoint?.benchmark ?? 100;

    return attachTimeAxis(visibleSeries).map((point) => {
      portfolioHighWatermark = Math.max(portfolioHighWatermark, point.portfolio);
      benchmarkHighWatermark = Math.max(benchmarkHighWatermark, point.benchmark);

      const portfolioReturn =
        firstPoint == null
          ? 0
          : (calculatePercentChange(firstPoint.portfolio, point.portfolio) ?? 0);
      const benchmarkReturn =
        firstPoint == null
          ? 0
          : (calculatePercentChange(firstPoint.benchmark, point.benchmark) ?? 0);
      const portfolioDrawdown =
        portfolioHighWatermark === 0
          ? 0
          : ((point.portfolio - portfolioHighWatermark) / portfolioHighWatermark) * 100;
      const benchmarkDrawdown =
        benchmarkHighWatermark === 0
          ? 0
          : ((point.benchmark - benchmarkHighWatermark) / benchmarkHighWatermark) * 100;

      const overlayReturns =
        mode === "INDEXED" && firstPoint != null
          ? Object.fromEntries(
              selectedOverlays.map((overlay) => [
                getOverlayDataKey(overlay.symbol),
                getOverlayReturnAtDate(
                  visibleOverlayPointsBySymbol.get(overlay.symbol) ?? [],
                  firstPoint.date,
                  point.date,
                ),
              ]),
            )
          : {};

      return {
        ...point,
        ...overlayReturns,
        benchmarkChangeFromRangeStart: firstPoint == null ? null : benchmarkReturn,
        benchmarkDisplay:
          mode === "DRAWDOWN" ? benchmarkDrawdown : mode === "GAP" ? 0 : benchmarkReturn,
        benchmarkDrawdown,
        benchmarkReturn,
        gap: portfolioReturn - benchmarkReturn,
        portfolioChangeFromRangeStart: firstPoint == null ? null : portfolioReturn,
        portfolioDisplay:
          mode === "DRAWDOWN"
            ? portfolioDrawdown
            : mode === "GAP"
              ? portfolioReturn - benchmarkReturn
              : portfolioReturn,
        portfolioDrawdown,
        portfolioReturn,
      };
    });
  }, [mode, selectedOverlays, visibleOverlayPointsBySymbol, visibleSeries]);
  const rangeStats = useMemo(() => {
    if (chartData.length === 0) {
      return null;
    }

    const firstPoint = chartData[0];
    const latestPoint = chartData[chartData.length - 1];
    const portfolioChange = calculatePercentChange(firstPoint.portfolio, latestPoint.portfolio);
    const benchmarkChange = calculatePercentChange(firstPoint.benchmark, latestPoint.benchmark);
    const gap =
      portfolioChange == null || benchmarkChange == null ? null : portfolioChange - benchmarkChange;

    return {
      latestPoint,
      portfolioChange,
      benchmarkChange,
      gap,
    };
  }, [chartData]);
  const selectionPoints = getSelectionPoints(chartData, selection);
  const hasActiveSelection = hasSelectionSpan(selectionPoints);
  const selectedPortfolioChange =
    selectionPoints == null
      ? null
      : calculatePercentChange(
          selectionPoints.startPoint.portfolio,
          selectionPoints.endPoint.portfolio,
        );
  const selectedBenchmarkChange =
    selectionPoints == null
      ? null
      : calculatePercentChange(
          selectionPoints.startPoint.benchmark,
          selectionPoints.endPoint.benchmark,
        );
  const selectedGap =
    selectedPortfolioChange == null || selectedBenchmarkChange == null
      ? null
      : selectedPortfolioChange - selectedBenchmarkChange;
  const modeCopy =
    mode === "INDEXED"
      ? {
          portfolioName: returnBasisCopy.portfolioName,
          benchmarkName: copy.charts.benchmark.modeCopy.INDEXED.benchmarkName,
          yAxisLabel: returnBasisCopy.yAxisLabel,
        }
      : copy.charts.benchmark.modeCopy[mode];
  const yAxis = useMemo(
    () =>
      getRoundedPercentAxis(
        chartData.flatMap((point) => {
          const primaryValues = [point.portfolioDisplay, point.benchmarkDisplay];
          const overlayValues =
            mode === "INDEXED"
              ? selectedOverlays
                  .map((overlay) => point[getOverlayDataKey(overlay.symbol)])
                  .filter((value): value is number => typeof value === "number")
              : [];

          return [...primaryValues, ...overlayValues];
        }),
      ),
    [chartData, mode, selectedOverlays],
  );
  const xDomain = useMemo(() => getTimeAxisDomain(chartData), [chartData]);
  const xAxisTicks = useMemo(() => buildTimeAxisTicks(chartData), [chartData]);
  const xAxisSpan = xDomain == null ? 0 : xDomain[1] - xDomain[0];
  const readoutPoint = hoverPoint ?? rangeStats?.latestPoint ?? null;
  const comparisonItems = useMemo<BenchmarkComparisonPickerItem[]>(() => {
    const firstPoint = visibleSeries[0] ?? null;
    const latestPoint = visibleSeries[visibleSeries.length - 1] ?? null;
    const quotesBySymbol = new Map(benchmarkQuotes.map((quote) => [quote.symbol, quote]));

    return comparisonOverlays.map((overlay, index) => {
      const quote = quotesBySymbol.get(overlay.symbol) ?? null;
      const returnPercent =
        firstPoint == null || latestPoint == null
          ? null
          : getOverlayReturnAtDate(
              visibleOverlayPointsBySymbol.get(overlay.symbol) ?? [],
              firstPoint.date,
              latestPoint.date,
            );

      return {
        symbol: overlay.symbol,
        displayName: overlay.displayName,
        market: overlay.market,
        currency: overlay.currency,
        price: quote?.price ?? null,
        returnPercent,
        color: OVERLAY_COLORS[index % OVERLAY_COLORS.length],
        selected: selectedComparisonSymbols.includes(overlay.symbol),
      };
    });
  }, [
    benchmarkQuotes,
    comparisonOverlays,
    selectedComparisonSymbols,
    visibleOverlayPointsBySymbol,
    visibleSeries,
  ]);

  function handleComparisonToggle(symbol: string) {
    setSelectedComparisonSymbols((currentSymbols) =>
      currentSymbols.includes(symbol)
        ? currentSymbols.filter((currentSymbol) => currentSymbol !== symbol)
        : [...currentSymbols, symbol],
    );
    setHoverPoint(null);
    setSelection(null);
  }

  function handleComparisonClear() {
    setSelectedComparisonSymbols([]);
    setHoverPoint(null);
    setSelection(null);
  }

  function handleChartMouseDown(state: ChartMouseState | undefined) {
    const point = getChartPoint(state);

    if (point == null) {
      return;
    }

    isDraggingRef.current = true;
    setSelection({
      startDate: point.date,
      endDate: point.date,
    });
  }

  function handleChartMouseMove(state: ChartMouseState | undefined) {
    const point = getChartPoint(state);

    if (point != null) {
      setHoverPoint(point);
    }

    if (!isDraggingRef.current || point == null) {
      return;
    }

    setSelection((currentSelection) =>
      currentSelection == null || currentSelection.endDate === point.date
        ? currentSelection
        : {
            ...currentSelection,
            endDate: point.date,
          },
    );
  }

  function handleChartMouseUp() {
    isDraggingRef.current = false;
  }

  function handleChartMouseLeave() {
    isDraggingRef.current = false;
    setHoverPoint(null);
  }

  function renderSeriesReadoutRow({
    change,
    markerClassName,
    name,
    value,
  }: {
    change: number;
    markerClassName: string;
    name: string;
    value: number;
  }) {
    const toneClassName = getValueClassName(change);

    return (
      <div className="chart-series-readout-row">
        <span className={`chart-series-marker ${markerClassName}`} aria-hidden="true" />
        <strong>{name}</strong>
        <span>{formatSeriesPointValue(value, mode, locale)}</span>
        <span className={toneClassName}>{formatSeriesChange(change, mode)}</span>
        <span className={`chart-series-percent-chip ${toneClassName}`}>
          {formatSeriesChange(change, mode)}
        </span>
      </div>
    );
  }

  function renderChartControls(className: string) {
    return (
      <div className={className}>
        <div className="chart-mode-row">
          <div className="chart-view-modes" aria-label={copy.charts.benchmark.performanceMode}>
            {PERFORMANCE_MODE_OPTIONS.map((option) => (
              <button
                aria-pressed={mode === option}
                className={mode === option ? "active" : ""}
                key={option}
                onClick={() => {
                  setMode(option);
                  setHoverPoint(null);
                  setSelection(null);
                }}
                type="button"
              >
                {copy.charts.benchmark.modes[option]}
              </button>
            ))}
          </div>
          <div className="chart-return-basis-group">
            <div
              className="chart-view-modes chart-return-basis"
              aria-label={copy.charts.benchmark.returnBasis.label}
            >
              {RETURN_BASIS_OPTIONS.map((option) => (
                <button
                  aria-pressed={returnBasis === option}
                  className={returnBasis === option ? "active" : ""}
                  key={option}
                  onClick={() => {
                    setReturnBasis(option);
                    setHoverPoint(null);
                    setSelection(null);
                  }}
                  type="button"
                >
                  {copy.charts.benchmark.returnBasis.options[option]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="chart-timeframes" aria-label={copy.charts.benchmark.timeframe}>
          {TIMEFRAME_OPTIONS.map((option) => (
            <button
              aria-pressed={timeframe === option}
              className={timeframe === option ? "active" : ""}
              key={option}
              onClick={() => {
                setTimeframe(option);
                setHoverPoint(null);
                setSelection(null);
              }}
              type="button"
            >
              {copy.charts.common.timeframes[option]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <article className="surface-card chart-card benchmark-chart-card">
      <div className="chart-card-header">
        <div>
          <p className="eyebrow">{copy.charts.benchmark.eyebrow}</p>
          <h2 className="section-title">
            {benchmarkSymbol == null
              ? copy.charts.benchmark.titleDefault
              : copy.charts.benchmark.titleWithSymbol(benchmarkSymbol)}
          </h2>
          {hasAnySeries ? (
            <p className="chart-subtitle">
              {getBasisLabel({
                benchmarkCurrency,
                comparisonBasis,
                copy: copy.charts.benchmark,
                portfolioCurrency,
              })}
            </p>
          ) : null}
        </div>
        {renderChartControls("chart-control-stack chart-control-stack-desktop")}
      </div>

      {renderChartControls("chart-control-stack chart-control-stack-mobile")}

      {shouldShowAbsoluteSummary ? (
        <div className="chart-stat-strip" aria-label={copy.charts.benchmark.absoluteSummary.label}>
          <div
            title={
              returnBasis === "ABSOLUTE"
                ? copy.charts.benchmark.absoluteSummary.hints.absoluteReturn
                : returnBasisCopy.hint
            }
          >
            <span>
              {returnBasis === "ABSOLUTE"
                ? copy.charts.benchmark.absoluteSummary.absoluteReturn
                : returnBasisCopy.summaryLabel}
            </span>
            <strong
              className={getValueClassName(
                returnBasis === "ABSOLUTE" ? performanceSummary.absoluteReturn : basisReturn,
              )}
            >
              {returnBasis !== "ABSOLUTE"
                ? basisReturn == null
                  ? "-"
                  : formatSignedPercent(basisReturn)
                : formatAbsoluteReturn(performanceSummary.absoluteReturn, locale)}
            </strong>
          </div>
          <div title={copy.charts.benchmark.absoluteSummary.hints.totalPnl}>
            <span>{copy.charts.benchmark.absoluteSummary.totalPnl}</span>
            <strong className={getValueClassName(performanceSummary.totalPnl)}>
              {formatPerformanceMoney(
                performanceSummary.totalPnl,
                performanceSummary.currency,
                locale,
              )}
            </strong>
          </div>
          <div title={copy.charts.benchmark.absoluteSummary.hints.netInvested}>
            <span>{copy.charts.benchmark.absoluteSummary.netInvested}</span>
            <strong>
              {formatPerformanceMoney(
                performanceSummary.netInvested,
                performanceSummary.currency,
                locale,
              )}
            </strong>
          </div>
          <div title={returnBasisCopy.hint}>
            <span>{copy.charts.benchmark.absoluteSummary.timeWeighted}</span>
            <strong>{returnBasisCopy.summaryValue}</strong>
          </div>
          {absoluteSummaryMessage == null ? null : (
            <div title={copy.charts.benchmark.absoluteSummary.hints.note}>
              <span>{copy.charts.benchmark.absoluteSummary.note}</span>
              <strong>{absoluteSummaryMessage}</strong>
            </div>
          )}
        </div>
      ) : null}

      {hasSeries ? (
        <div className="chart-workspace">
          {rangeStats == null ? null : (
            <div className="chart-stat-strip" aria-label={copy.charts.benchmark.rangeSummary}>
              <div>
                <span>{copy.charts.benchmark.portfolio}</span>
                <strong
                  className={
                    rangeStats.portfolioChange == null
                      ? ""
                      : rangeStats.portfolioChange >= 0
                        ? "value-positive"
                        : "value-negative"
                  }
                >
                  {rangeStats.portfolioChange == null
                    ? "-"
                    : formatSignedPercent(rangeStats.portfolioChange)}
                </strong>
              </div>
              <div>
                <span>{benchmarkSymbol ?? copy.charts.benchmark.benchmark}</span>
                <strong
                  className={
                    rangeStats.benchmarkChange == null
                      ? ""
                      : rangeStats.benchmarkChange >= 0
                        ? "value-positive"
                        : "value-negative"
                  }
                >
                  {rangeStats.benchmarkChange == null
                    ? "-"
                    : formatSignedPercent(rangeStats.benchmarkChange)}
                </strong>
              </div>
              <div>
                <span>
                  {mode === "GAP" ? copy.charts.benchmark.latestGap : copy.charts.benchmark.gap}
                </span>
                <strong
                  className={
                    rangeStats.gap == null
                      ? ""
                      : rangeStats.gap >= 0
                        ? "value-positive"
                        : "value-negative"
                  }
                >
                  {rangeStats.gap == null ? "-" : formatPercentagePoint(rangeStats.gap)}
                </strong>
              </div>
              <div>
                <span>{modeCopy.yAxisLabel}</span>
                <strong>
                  {formatModeValue(rangeStats.latestPoint.portfolioDisplay, mode, locale)}
                </strong>
              </div>
            </div>
          )}

          <div className="chart-shell" ref={chartContainerRef}>
            <ResponsiveContainer height={380} key={chartRenderKey} width="100%">
              <LineChart
                data={chartData}
                margin={{ top: 16, right: 14, left: 8, bottom: 8 }}
                onMouseDown={handleChartMouseDown}
                onMouseLeave={handleChartMouseLeave}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
              >
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 5" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={xDomain}
                  ticks={xAxisTicks}
                  tickFormatter={(value: number | string) =>
                    formatTimeAxisTick(value, locale, xAxisSpan)
                  }
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  height={36}
                  tickMargin={8}
                  stroke="var(--chart-axis)"
                />
                <YAxis
                  tickFormatter={(value: number) => formatModeValue(value, mode, locale)}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  domain={yAxis?.domain}
                  ticks={yAxis?.ticks}
                  tickMargin={8}
                  stroke="var(--chart-axis)"
                />
                <Tooltip
                  cursor={{
                    stroke: "var(--chart-hover)",
                    strokeDasharray: "2 1",
                    strokeWidth: 1.25,
                  }}
                  content={<BenchmarkChartTooltip language={language} mode={mode} />}
                />
                {!hasActiveSelection || selection == null ? null : (
                  <ReferenceArea
                    x1={getUtcDateTime(selection.startDate)}
                    x2={getUtcDateTime(selection.endDate)}
                    stroke="rgba(23, 107, 85, 0.18)"
                    fill="rgba(23, 107, 85, 0.10)"
                    ifOverflow="hidden"
                  />
                )}
                <Line
                  isAnimationActive={false}
                  type="linear"
                  dataKey="portfolioDisplay"
                  name={modeCopy.portfolioName}
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--accent-strong)" }}
                />
                <Line
                  isAnimationActive={false}
                  type="linear"
                  dataKey="benchmarkDisplay"
                  name={
                    mode === "GAP"
                      ? modeCopy.benchmarkName
                      : (benchmarkSymbol ?? modeCopy.benchmarkName)
                  }
                  stroke="var(--warm)"
                  strokeWidth={1.6}
                  strokeOpacity={0.72}
                  dot={false}
                  activeDot={{ r: 3.5, fill: "var(--warm)" }}
                />
                {mode !== "INDEXED"
                  ? null
                  : selectedOverlays.map((overlay) => {
                      const comparisonItem = comparisonItems.find(
                        (item) => item.symbol === overlay.symbol,
                      );

                      return (
                        <Line
                          activeDot={{
                            fill: comparisonItem?.color ?? "var(--ink)",
                            r: 3.5,
                          }}
                          dataKey={getOverlayDataKey(overlay.symbol)}
                          dot={false}
                          isAnimationActive={false}
                          key={overlay.symbol}
                          name={overlay.symbol}
                          stroke={comparisonItem?.color ?? "var(--ink)"}
                          strokeOpacity={0.86}
                          strokeWidth={1.9}
                          type="linear"
                        />
                      );
                    })}
              </LineChart>
            </ResponsiveContainer>
            {readoutPoint == null ? null : (
              <div className="chart-series-readout" aria-label={copy.charts.benchmark.rangeSummary}>
                <span className="chart-series-readout-date">
                  {formatChartDate(readoutPoint.date, locale)}
                </span>
                {renderSeriesReadoutRow({
                  change: getSeriesChangeValue(readoutPoint, "portfolio", mode),
                  markerClassName: "chart-series-marker-portfolio",
                  name: modeCopy.portfolioName,
                  value: readoutPoint.portfolioDisplay,
                })}
                {renderSeriesReadoutRow({
                  change: getSeriesChangeValue(readoutPoint, "benchmark", mode),
                  markerClassName: "chart-series-marker-benchmark",
                  name:
                    mode === "GAP"
                      ? modeCopy.benchmarkName
                      : (benchmarkSymbol ?? modeCopy.benchmarkName),
                  value: readoutPoint.benchmarkDisplay,
                })}
              </div>
            )}
            <div
              className={
                hasActiveSelection &&
                selectionPoints != null &&
                selectedPortfolioChange != null &&
                selectedBenchmarkChange != null
                  ? "chart-selection-readout"
                  : "chart-selection-readout chart-selection-readout-idle"
              }
            >
              {!hasActiveSelection ||
              selectionPoints == null ||
              selectedPortfolioChange == null ||
              selectedBenchmarkChange == null ? (
                <span>{copy.charts.common.dragToCompare}</span>
              ) : (
                <>
                  <span>
                    {formatChartDate(selectionPoints.startPoint.date, locale)}{" "}
                    {copy.charts.common.to} {formatChartDate(selectionPoints.endPoint.date, locale)}
                  </span>
                  <strong
                    className={selectedPortfolioChange >= 0 ? "value-positive" : "value-negative"}
                  >
                    {copy.charts.benchmark.portfolio} {formatSignedPercent(selectedPortfolioChange)}
                  </strong>
                  <span
                    className={selectedBenchmarkChange >= 0 ? "value-positive" : "value-negative"}
                  >
                    {benchmarkSymbol ?? copy.charts.benchmark.benchmark}{" "}
                    {formatSignedPercent(selectedBenchmarkChange)}
                  </span>
                  {selectedGap == null ? null : (
                    <span className={selectedGap >= 0 ? "value-positive" : "value-negative"}>
                      {copy.charts.benchmark.gap} {formatPercentagePoint(selectedGap)}
                    </span>
                  )}
                </>
              )}
            </div>
            {mode === "INDEXED" && comparisonItems.length > 0 ? (
              <BenchmarkComparisonPicker
                items={comparisonItems}
                labels={copy.charts.benchmark.comparisonPicker}
                language={language}
                onClear={handleComparisonClear}
                onToggle={handleComparisonToggle}
                selectedSymbols={selectedComparisonSymbols}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="chart-empty-state">
          <strong>{copy.charts.common.noChartData}</strong>
          <p>
            {getUnavailableMessage({
              benchmarkSymbol,
              copy: copy.charts.benchmark,
              portfolioCurrency,
              returnBasis,
              status,
            })}
          </p>
        </div>
      )}
    </article>
  );
}
