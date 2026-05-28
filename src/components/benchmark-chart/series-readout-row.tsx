import { formatSeriesPointValue, getValueClassName } from "@/components/benchmark-chart/formatting";
import type { PerformanceMode } from "@/components/benchmark-chart/types";

type BenchmarkSeriesReadoutRowProps = {
  change: number;
  locale: string;
  markerClassName?: string;
  markerColor?: string;
  mode: PerformanceMode;
  name: string;
  onRemove?: () => void;
  removeLabel?: string;
  value: number;
};

export function BenchmarkSeriesReadoutRow({
  change,
  locale,
  markerClassName,
  markerColor,
  mode,
  name,
  onRemove,
  removeLabel,
  value,
}: BenchmarkSeriesReadoutRowProps) {
  const toneClassName = getValueClassName(change);

  return (
    <div className="chart-series-readout-row">
      <span
        className={["chart-series-marker", markerClassName].filter(Boolean).join(" ")}
        style={markerColor == null ? undefined : { backgroundColor: markerColor }}
        aria-hidden="true"
      />
      <strong>{name}</strong>
      <span className={`chart-series-percent-chip ${toneClassName}`}>
        {formatSeriesPointValue(value, mode, locale)}
      </span>
      {onRemove == null ? (
        <span className="chart-series-remove-spacer" aria-hidden="true" />
      ) : (
        <button
          aria-label={removeLabel}
          className="chart-series-remove-button"
          onClick={onRemove}
          type="button"
        >
          x
        </button>
      )}
    </div>
  );
}
