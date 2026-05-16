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
  return new Intl.DateTimeFormat("en-GB", {
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

function getUnavailableMessage(asset: AssetDetail) {
  return asset.marketData.historyUnavailableReason ?? "No price history is available for this chart yet.";
}

export function AssetPriceChart({ asset }: AssetPriceChartProps) {
  const hasHistory = asset.marketData.priceHistory.length > 0;
  const hasAverageCostLine = asset.position.hasOpenPosition && asset.position.averageCost != null;

  return (
    <article className="surface-card chart-card">
      <div className="chart-card-header">
        <div>
          <p className="eyebrow">Performance</p>
          <h2 className="section-title">
            {asset.dr == null
              ? "Price versus average cost"
              : `${asset.instrument.symbol} and parent-share equivalent`}
          </h2>
        </div>
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
                  <stop offset="0%" stopColor="rgba(23, 107, 85, 0.30)" />
                  <stop offset="100%" stopColor="rgba(23, 107, 85, 0.04)" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatChartDate}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                stroke="var(--muted)"
              />
              <YAxis
                tickFormatter={(value: number) => formatPrice(value, asset.instrument.currency)}
                tickLine={false}
                axisLine={false}
                width={92}
                stroke="var(--muted)"
              />
              <Tooltip
                cursor={{ stroke: "rgba(23, 107, 85, 0.18)", strokeWidth: 1 }}
                contentStyle={{
                  borderRadius: 18,
                  border: "1px solid var(--line)",
                  background: "var(--surface-strong)",
                  boxShadow: "var(--shadow)",
                  color: "var(--ink)"
                }}
                formatter={(value: number) => [formatPrice(value, asset.instrument.currency), "Close"]}
                labelFormatter={(value: string) => formatChartDate(value)}
              />
              {hasAverageCostLine ? (
                <ReferenceLine
                  y={asset.position.averageCost ?? undefined}
                  stroke="var(--warm)"
                  strokeDasharray="6 6"
                  ifOverflow="extendDomain"
                  label={{
                    value: `Avg ${formatPrice(
                      asset.position.averageCost ?? 0,
                      asset.instrument.currency
                    )}`,
                    fill: "var(--warm)",
                    fontSize: 12,
                    position: "insideTopLeft"
                  }}
                />
              ) : null}
              <Area
                type="monotone"
                dataKey="close"
                stroke="var(--accent)"
                strokeWidth={2.5}
                fill="url(#assetArea)"
                dot={false}
                activeDot={{ r: 4, fill: "var(--accent)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="chart-empty-state">
          <p>{getUnavailableMessage(asset)}</p>
        </div>
      )}
    </article>
  );
}
