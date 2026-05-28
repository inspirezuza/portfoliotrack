import type { ReactNode } from "react";
import type { getUiCopy } from "@/lib/ui/copy";

type BenchmarkChartCopy = ReturnType<typeof getUiCopy>["charts"]["benchmark"];

type BenchmarkChartHeaderProps = {
  benchmarkSymbol: string | null;
  controls: ReactNode;
  copy: BenchmarkChartCopy;
  hasAnySeries: boolean;
  subtitle: string;
};

export function BenchmarkChartHeader({
  benchmarkSymbol,
  controls,
  copy,
  hasAnySeries,
  subtitle,
}: BenchmarkChartHeaderProps) {
  return (
    <div className="chart-card-header">
      <div>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 className="section-title">
          {benchmarkSymbol == null ? copy.titleDefault : copy.titleWithSymbol(benchmarkSymbol)}
        </h2>
        {hasAnySeries ? <p className="chart-subtitle">{subtitle}</p> : null}
      </div>
      {controls}
    </div>
  );
}
