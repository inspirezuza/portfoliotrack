import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import {
  formatChartDate,
  formatModeValue,
  formatSignedPercent,
} from "@/components/benchmark-chart/formatting";
import type { ChartPoint, PerformanceMode, ReturnBasis } from "@/components/benchmark-chart/types";

export type BenchmarkChartTooltipProps = {
  active?: boolean;
  label?: number;
  language: UiLanguage;
  mode: PerformanceMode;
  payload?: Array<{
    dataKey?: string;
    name?: string;
    payload?: ChartPoint;
    value?: number;
  }>;
  returnBasis: ReturnBasis;
};

export function BenchmarkChartTooltip({
  active,
  label,
  language,
  mode,
  payload,
  returnBasis,
}: BenchmarkChartTooltipProps) {
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
            {mode !== "INDEXED" || returnBasis !== "TWR" || change == null ? null : (
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
