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
  totalCost: number;
  marketValue: number | null;
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
  "#6f7d2c"
];

function getHoldingValue(holding: AllocationHolding) {
  return holding.marketValue ?? holding.totalCost;
}

function buildAllocationSlices(holdings: AllocationHolding[], language: UiLanguage) {
  const copy = getUiCopy(language).holdings.allocation;
  const chartHoldings = holdings
    .map((holding) => ({
      ...holding,
      chartValue: getHoldingValue(holding)
    }))
    .filter((holding) => holding.chartValue > 0)
    .sort((left, right) => right.chartValue - left.chartValue);
  const totalValue = chartHoldings.reduce((total, holding) => total + holding.chartValue, 0);

  if (totalValue <= 0) {
    return [];
  }

  const primaryHoldings = chartHoldings.slice(0, 6);
  const otherHoldings = chartHoldings.slice(6);
  const slices = primaryHoldings.map((holding, index) => ({
    id: String(holding.instrumentId),
    symbol: holding.symbol,
    displayName: holding.displayName,
    currency: holding.currency,
    value: holding.chartValue,
    weight: holding.portfolioWeight ?? holding.chartValue / totalValue,
    color: HOLDING_COLORS[index % HOLDING_COLORS.length]
  }));

  if (otherHoldings.length > 0) {
    const otherValue = otherHoldings.reduce((total, holding) => total + holding.chartValue, 0);

    slices.push({
      id: "other",
      symbol: copy.other,
      displayName: copy.positions(otherHoldings.length),
      currency: primaryHoldings[0]?.currency ?? otherHoldings[0].currency,
      value: otherValue,
      weight: otherValue / totalValue,
      color: HOLDING_COLORS[6]
    });
  }

  return slices;
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
  const slices = buildAllocationSlices(holdings, language);

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
              paddingAngle={2}
              stroke="var(--surface-strong)"
              strokeWidth={3}
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
