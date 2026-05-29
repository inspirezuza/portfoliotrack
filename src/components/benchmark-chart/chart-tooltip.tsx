import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import {
  formatChartDate,
  formatModeValue,
  getValueClassName,
} from "@/components/benchmark-chart/formatting";
import type { ChartPoint, PerformanceMode } from "@/components/benchmark-chart/types";

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
};

export function BenchmarkChartTooltip({
  active,
  label,
  language,
  mode,
  payload,
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

        return (
          <div className="chart-tooltip-row" key={item.dataKey}>
            <span>{item.name ?? item.dataKey}</span>
            <strong className={getValueClassName(value)}>
              {formatModeValue(value, mode, locale)}
            </strong>
          </div>
        );
      })}
    </div>
  );
}
