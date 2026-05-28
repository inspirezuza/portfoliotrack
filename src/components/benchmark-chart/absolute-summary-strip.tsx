import {
  formatAbsoluteReturn,
  formatPerformanceMoney,
  formatSignedPercent,
  getValueClassName,
  type BenchmarkPerformanceSummaryStatus,
} from "@/components/benchmark-chart/formatting";
import type { ReturnBasis } from "@/components/benchmark-chart/types";
import type { getUiCopy } from "@/lib/ui/copy";

type BenchmarkCopy = ReturnType<typeof getUiCopy>["charts"]["benchmark"];
type ReturnBasisCopy = BenchmarkCopy["returnBasis"][ReturnBasis];

export type BenchmarkPerformanceSummary = {
  status: BenchmarkPerformanceSummaryStatus;
  currency: string | null;
  totalPnl: number | null;
  netInvested: number | null;
  absoluteReturn: number | null;
};

export type BenchmarkAbsoluteSummaryStripProps = {
  basisReturn: number | null;
  copy: BenchmarkCopy;
  locale: string;
  message: string | null;
  performanceSummary: BenchmarkPerformanceSummary;
  returnBasis: ReturnBasis;
  returnBasisCopy: ReturnBasisCopy;
};

export function BenchmarkAbsoluteSummaryStrip({
  basisReturn,
  copy,
  locale,
  message,
  performanceSummary,
  returnBasis,
  returnBasisCopy,
}: BenchmarkAbsoluteSummaryStripProps) {
  return (
    <div className="chart-stat-strip" aria-label={copy.absoluteSummary.label}>
      <div
        title={
          returnBasis === "ABSOLUTE"
            ? copy.absoluteSummary.hints.absoluteReturn
            : returnBasisCopy.hint
        }
      >
        <span>
          {returnBasis === "ABSOLUTE"
            ? copy.absoluteSummary.absoluteReturn
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
      <div title={copy.absoluteSummary.hints.totalPnl}>
        <span>{copy.absoluteSummary.totalPnl}</span>
        <strong className={getValueClassName(performanceSummary.totalPnl)}>
          {formatPerformanceMoney(performanceSummary.totalPnl, performanceSummary.currency, locale)}
        </strong>
      </div>
      <div title={copy.absoluteSummary.hints.netInvested}>
        <span>{copy.absoluteSummary.netInvested}</span>
        <strong>
          {formatPerformanceMoney(
            performanceSummary.netInvested,
            performanceSummary.currency,
            locale,
          )}
        </strong>
      </div>
      <div title={returnBasisCopy.hint}>
        <span>{copy.absoluteSummary.timeWeighted}</span>
        <strong>{returnBasisCopy.summaryValue}</strong>
      </div>
      {message == null ? null : (
        <div title={copy.absoluteSummary.hints.note}>
          <span>{copy.absoluteSummary.note}</span>
          <strong>{message}</strong>
        </div>
      )}
    </div>
  );
}
