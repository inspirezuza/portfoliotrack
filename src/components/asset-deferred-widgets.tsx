"use client";

import { lazy, Suspense } from "react";
import type { AssetDetail } from "@/server/assets";

const AssetPriceChart = lazy(() =>
  import("@/components/asset-price-chart").then((module) => ({
    default: module.AssetPriceChart,
  })),
);

export function DeferredAssetPriceChart({ asset }: { asset: AssetDetail }) {
  return (
    <Suspense
      fallback={<div className="loading-skeleton-panel" style={{ minHeight: 360 }} aria-hidden="true" />}
    >
      <AssetPriceChart asset={asset} />
    </Suspense>
  );
}
