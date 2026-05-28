import {
  PERFORMANCE_MODE_OPTIONS,
  RETURN_BASIS_OPTIONS,
  TIMEFRAME_OPTIONS,
} from "@/components/benchmark-chart/chart-selection";
import type {
  PerformanceMode,
  ReturnBasis,
  TimeframeKey,
} from "@/components/benchmark-chart/types";
import type { getUiCopy } from "@/lib/ui/copy";

type BenchmarkCopy = ReturnType<typeof getUiCopy>["charts"]["benchmark"];
type TimeframeLabels = ReturnType<typeof getUiCopy>["charts"]["common"]["timeframes"];

export type BenchmarkChartControlsProps = {
  className: string;
  copy: BenchmarkCopy;
  mode: PerformanceMode;
  onModeChange: (mode: PerformanceMode) => void;
  onReturnBasisChange: (returnBasis: ReturnBasis) => void;
  onTimeframeChange: (timeframe: TimeframeKey) => void;
  returnBasis: ReturnBasis;
  timeframe: TimeframeKey;
  timeframeLabels: TimeframeLabels;
};

export function BenchmarkChartControls({
  className,
  copy,
  mode,
  onModeChange,
  onReturnBasisChange,
  onTimeframeChange,
  returnBasis,
  timeframe,
  timeframeLabels,
}: BenchmarkChartControlsProps) {
  return (
    <div className={className}>
      <div className="chart-mode-row">
        <div className="chart-view-modes" aria-label={copy.performanceMode}>
          {PERFORMANCE_MODE_OPTIONS.map((option) => (
            <button
              aria-pressed={mode === option}
              className={mode === option ? "active" : ""}
              disabled={returnBasis !== "TWR" && option === "DRAWDOWN"}
              key={option}
              onClick={() => onModeChange(option)}
              type="button"
            >
              {copy.modes[option]}
            </button>
          ))}
        </div>
        <div className="chart-return-basis-group">
          <div className="chart-view-modes chart-return-basis" aria-label={copy.returnBasis.label}>
            {RETURN_BASIS_OPTIONS.map((option) => (
              <button
                aria-pressed={returnBasis === option}
                className={returnBasis === option ? "active" : ""}
                key={option}
                onClick={() => onReturnBasisChange(option)}
                type="button"
              >
                {copy.returnBasis.options[option]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="chart-timeframes" aria-label={copy.timeframe}>
        {TIMEFRAME_OPTIONS.map((option) => (
          <button
            aria-pressed={timeframe === option}
            className={timeframe === option ? "active" : ""}
            key={option}
            onClick={() => onTimeframeChange(option)}
            type="button"
          >
            {timeframeLabels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}
