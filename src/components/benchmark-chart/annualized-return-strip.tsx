import {
  formatPercentagePoint,
  formatSignedPercent,
} from "@/components/benchmark-chart/formatting";
import type { AnnualizedReturns } from "@/components/benchmark-chart/chart-helpers";
import type { getUiCopy } from "@/lib/ui/copy";

type BenchmarkCopy = ReturnType<typeof getUiCopy>["charts"]["benchmark"];

type BenchmarkAnnualizedReturnStripProps = {
  annualizedReturns: AnnualizedReturns;
  benchmarkSymbol: string | null;
  copy: BenchmarkCopy;
};

function getValueToneClass(value: number | null) {
  if (value == null) {
    return "";
  }

  return value >= 0 ? "value-positive" : "value-negative";
}

function formatPerYear(value: number | null, copy: BenchmarkCopy) {
  return value == null ? "-" : copy.annualized.perYear(formatSignedPercent(value));
}

function getAnnualizedGap(annualizedReturns: AnnualizedReturns) {
  if (annualizedReturns.portfolio == null || annualizedReturns.benchmark == null) {
    return null;
  }

  return annualizedReturns.portfolio - annualizedReturns.benchmark;
}

export function BenchmarkAnnualizedReturnStrip({
  annualizedReturns,
  benchmarkSymbol,
  copy,
}: BenchmarkAnnualizedReturnStripProps) {
  const gap = getAnnualizedGap(annualizedReturns);

  return (
    <div className="chart-stat-strip" aria-label={copy.annualized.label}>
      <div title={copy.annualized.hint}>
        <span>{copy.annualized.portfolio}</span>
        <strong className={getValueToneClass(annualizedReturns.portfolio)}>
          {formatPerYear(annualizedReturns.portfolio, copy)}
        </strong>
      </div>
      <div title={copy.annualized.hint}>
        <span>{benchmarkSymbol ?? copy.benchmark}</span>
        <strong className={getValueToneClass(annualizedReturns.benchmark)}>
          {formatPerYear(annualizedReturns.benchmark, copy)}
        </strong>
      </div>
      {gap == null ? null : (
        <div title={copy.annualized.gapHint}>
          <span>{copy.annualized.vs(benchmarkSymbol ?? copy.benchmark)}</span>
          <strong className={getValueToneClass(gap)}>{formatPercentagePoint(gap)}</strong>
        </div>
      )}
    </div>
  );
}
