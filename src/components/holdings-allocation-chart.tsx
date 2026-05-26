"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency, formatPercentRatio } from "@/lib/format";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";

type AllocationHolding = {
  instrumentId: number;
  symbol: string;
  displayName: string;
  currency: string;
  valuationCurrency: string;
  totalCost: number;
  totalCostInValuationCurrency: number | null;
  marketValue: number | null;
  marketValueInValuationCurrency: number | null;
  portfolioWeight: number | null;
};

type HoldingsAllocationChartProps = {
  holdings: AllocationHolding[];
  language: UiLanguage;
};

type AllocationSlice = {
  id: string;
  symbol: string;
  displayName: string;
  currency: string;
  value: number;
  weight: number;
  color: string;
};

type AllocationTooltipProps = {
  active?: boolean;
  language: UiLanguage;
  payload?: Array<{
    payload?: AllocationSlice;
  }>;
};

const HOLDING_COLORS = [
  "#08745d",
  "#b87824",
  "#3d6fb6",
  "#9a5bb5",
  "#d05a47",
  "#2f8f9d",
  "#6f7d2c",
  "#c44f7c",
  "#4d7f52",
  "#d29a2f",
  "#5765a8",
  "#b65f2a",
  "#17836f",
  "#7a6b2f",
  "#8b5f9f",
  "#c15f52",
  "#2f7fa5",
  "#718238",
  "#bf7d2d",
  "#4f8a79",
  "#96624c",
  "#6573a6",
  "#a65f7f",
  "#517a3e"
];

function getHoldingChartValue(holding: AllocationHolding, useValuationCurrency: boolean) {
  if (useValuationCurrency) {
    const value = holding.marketValueInValuationCurrency ?? holding.totalCostInValuationCurrency;

    return value == null
      ? null
      : {
          currency: holding.valuationCurrency,
          value
        };
  }

  return {
    currency: holding.currency,
    value: holding.marketValue ?? holding.totalCost
  };
}

function buildAllocationSlices(holdings: AllocationHolding[]) {
  const useValuationCurrency = new Set(holdings.map((holding) => holding.currency)).size > 1;
  const chartHoldings = holdings
    .map((holding) => {
      const chartValue = getHoldingChartValue(holding, useValuationCurrency);

      return chartValue == null
        ? null
        : {
            ...holding,
            chartCurrency: chartValue.currency,
            chartValue: chartValue.value
          };
    })
    .filter((holding): holding is NonNullable<typeof holding> => holding != null)
    .filter((holding) => holding.chartValue > 0)
    .sort((left, right) => right.chartValue - left.chartValue);
  const totalValue = chartHoldings.reduce((total, holding) => total + holding.chartValue, 0);

  if (totalValue <= 0) {
    return [];
  }

  return chartHoldings.map((holding, index) => ({
    id: String(holding.instrumentId),
    symbol: holding.symbol,
    displayName: holding.displayName,
    currency: holding.chartCurrency,
    value: holding.chartValue,
    weight: holding.portfolioWeight ?? holding.chartValue / totalValue,
    color: HOLDING_COLORS[index % HOLDING_COLORS.length]
  }));
}

function AllocationTooltip({ active, language, payload }: AllocationTooltipProps) {
  const slice = payload?.[0]?.payload;
  const copy = getUiCopy(language).holdings.allocation;
  const locale = getUiLocale(language);

  if (!active || slice == null) {
    return null;
  }

  return (
    <div className="chart-tooltip allocation-tooltip">
      <span>{slice.displayName}</span>
      <strong>{slice.symbol}</strong>
      <em>{formatCurrency(slice.value, { currency: slice.currency, locale })}</em>
      <em>
        {formatPercentRatio(slice.weight, { locale })} {copy.ofHoldings}
      </em>
    </div>
  );
}

export function HoldingsAllocationChart({ holdings, language }: HoldingsAllocationChartProps) {
  const copy = getUiCopy(language).holdings.allocation;
  const locale = getUiLocale(language);
  const slices = buildAllocationSlices(holdings);

  if (slices.length === 0) {
    return null;
  }

  return (
    <div className="holdings-allocation" aria-label={copy.ariaLabel}>
      <div className="holdings-pie-shell">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="symbol"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={0}
              stroke="none"
              strokeWidth={0}
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell key={slice.id} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip content={<AllocationTooltip language={language} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="holdings-pie-legend">
        {slices.map((slice) => (
          <li key={slice.id}>
            <span style={{ background: slice.color }} aria-hidden="true" />
            <div>
              <strong>{slice.symbol}</strong>
              <em>{formatPercentRatio(slice.weight, { locale })}</em>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
