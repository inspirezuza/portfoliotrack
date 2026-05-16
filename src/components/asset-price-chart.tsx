"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCurrency } from "@/lib/format";
import type { AssetDetail } from "@/server/assets";

type AssetPriceChartProps = {
  asset: AssetDetail;
};

function formatChartDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatPrice(value: number, currency: string) {
  return formatCurrency(value, {
    currency,
    maximumFractionDigits: value >= 100 ? 2 : 4
  });
}

export function AssetPriceChart({ asset }: AssetPriceChartProps) {
  const hasHistory = asset.marketData.priceHistory.length > 0;
  const hasAverageCostLine = asset.position.hasOpenPosition && asset.position.averageCost != null;

  return (
    <article className="surface-card chart-card">
      <div className="chart-card-header">
        <div>
          <p className="eyebrow">Price history</p>
          <h2 className="section-title">Daily closes</h2>
        </div>
        <p className="surface-copy">
          {hasHistory
            ? hasAverageCostLine
              ? "The dashed guide marks your current average cost across the cached history range."
              : "Provider-linked price history is available even before you build an open position."
            : asset.marketData.historyUnavailableReason ?? "Historical prices are unavailable right now."}
        </p>
      </div>

      {hasHistory ? (
        <div className="chart-shell">
          <ResponsiveContainer width="100%" height={360}>
            <AreaChart
              data={asset.marketData.priceHistory}
              margin={{ top: 12, right: 8, left: 0, bottom: 8 }}
            >
              <defs>
                <linearGradient id="assetArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(201, 111, 59, 0.30)" />
                  <stop offset="100%" stopColor="rgba(201, 111, 59, 0.04)" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(31, 28, 22, 0.08)" strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatChartDate}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                stroke="rgba(110, 102, 93, 0.9)"
              />
              <YAxis
                tickFormatter={(value: number) => formatPrice(value, asset.instrument.currency)}
                tickLine={false}
                axisLine={false}
                width={92}
                stroke="rgba(110, 102, 93, 0.9)"
              />
              <Tooltip
                cursor={{ stroke: "rgba(201, 111, 59, 0.18)", strokeWidth: 1 }}
                contentStyle={{
                  borderRadius: 18,
                  border: "1px solid rgba(31, 28, 22, 0.12)",
                  background: "rgba(255, 251, 244, 0.96)",
                  boxShadow: "0 24px 80px rgba(53, 40, 21, 0.12)"
                }}
                formatter={(value: number) => [formatPrice(value, asset.instrument.currency), "Close"]}
                labelFormatter={(value: string) => formatChartDate(value)}
              />
              {hasAverageCostLine ? (
                <ReferenceLine
                  y={asset.position.averageCost ?? undefined}
                  stroke="var(--accent-strong)"
                  strokeDasharray="6 6"
                  ifOverflow="extendDomain"
                  label={{
                    value: `Avg cost ${formatPrice(
                      asset.position.averageCost ?? 0,
                      asset.instrument.currency
                    )}`,
                    fill: "var(--accent-strong)",
                    fontSize: 12,
                    position: "insideTopLeft"
                  }}
                />
              ) : null}
              <Area
                type="monotone"
                dataKey="close"
                stroke="var(--warm)"
                strokeWidth={2.5}
                fill="url(#assetArea)"
                dot={false}
                activeDot={{ r: 4, fill: "var(--warm)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="chart-empty-state">
          <p>{asset.marketData.historyUnavailableReason ?? "Historical prices are unavailable right now."}</p>
        </div>
      )}
    </article>
  );
}
