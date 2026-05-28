import {
  formatChartDate,
  formatPrice,
  formatSignedPercent,
} from "@/components/asset-price-chart/formatting";

type AssetSelectionPoint = {
  close: number;
  date: string;
};

type AssetPriceSelectionReadoutProps = {
  currency: string;
  hasActiveSelection: boolean;
  selectionPercent: number | null;
  selectionPoints: {
    startPoint: AssetSelectionPoint;
    endPoint: AssetSelectionPoint;
  } | null;
};

export function AssetPriceSelectionReadout({
  currency,
  hasActiveSelection,
  selectionPercent,
  selectionPoints,
}: AssetPriceSelectionReadoutProps) {
  const isIdle = !hasActiveSelection || selectionPoints == null || selectionPercent == null;

  return (
    <div
      className={
        isIdle ? "chart-selection-readout chart-selection-readout-idle" : "chart-selection-readout"
      }
    >
      {isIdle ? (
        <span>Drag across the chart to compare</span>
      ) : (
        <>
          <span>
            {formatChartDate(selectionPoints.startPoint.date)} to{" "}
            {formatChartDate(selectionPoints.endPoint.date)}
          </span>
          <strong className={selectionPercent >= 0 ? "value-positive" : "value-negative"}>
            {formatSignedPercent(selectionPercent)}
          </strong>
          <span>
            {formatPrice(selectionPoints.startPoint.close, currency)} to{" "}
            {formatPrice(selectionPoints.endPoint.close, currency)}
          </span>
        </>
      )}
    </div>
  );
}
