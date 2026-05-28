"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import type { BenchmarkChart as BenchmarkChartComponent } from "@/components/benchmark-chart";
import type { PortfolioChart as PortfolioChartComponent } from "@/components/portfolio-chart";
import type { DashboardBenchmarkMonthlyReturn, DashboardBenchmarkQuote } from "@/server/dashboard";
import type { HoldingRow } from "@/server/holdings";
import type { UiLanguage } from "@/lib/ui/translations";

const HoldingsAllocationChart = lazy(() =>
  import("@/components/holdings-allocation-chart").then((module) => ({
    default: module.HoldingsAllocationChart,
  })),
);
const BenchmarkChart = lazy(() =>
  import("@/components/benchmark-chart").then((module) => ({
    default: module.BenchmarkChart,
  })),
);
const HoldingsTable = lazy(() =>
  import("@/components/holdings-table").then((module) => ({
    default: module.HoldingsTable,
  })),
);
const MarketBenchmarks = lazy(() =>
  import("@/components/market-benchmarks").then((module) => ({
    default: module.MarketBenchmarks,
  })),
);
const PortfolioChart = lazy(() =>
  import("@/components/portfolio-chart").then((module) => ({
    default: module.PortfolioChart,
  })),
);

function DeferredFallback({ minHeight }: { minHeight: number }) {
  return <div className="loading-skeleton-panel" style={{ minHeight }} aria-hidden="true" />;
}

function ViewportDeferred({
  children,
  eager = false,
  fallback,
  rootMargin = "300px",
}: {
  children: ReactNode;
  eager?: boolean;
  fallback: ReactNode;
  rootMargin?: string;
}) {
  const [shouldRender, setShouldRender] = useState(eager);
  const markerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shouldRender) {
      return;
    }

    const marker = markerRef.current;

    if (marker == null) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(marker);

    return () => observer.disconnect();
  }, [rootMargin, shouldRender]);

  if (shouldRender) {
    return <>{children}</>;
  }

  return <div ref={markerRef}>{fallback}</div>;
}

export function DeferredBenchmarkChart(props: ComponentProps<typeof BenchmarkChartComponent>) {
  return (
    <ViewportDeferred eager fallback={<DeferredFallback minHeight={380} />}>
      <Suspense fallback={<DeferredFallback minHeight={380} />}>
        <BenchmarkChart {...props} />
      </Suspense>
    </ViewportDeferred>
  );
}

export function DeferredHoldingsAllocationChart({
  holdings,
  language,
}: {
  holdings: HoldingRow[];
  language: UiLanguage;
}) {
  return (
    <ViewportDeferred eager fallback={<DeferredFallback minHeight={190} />}>
      <Suspense fallback={<DeferredFallback minHeight={190} />}>
        <HoldingsAllocationChart holdings={holdings} language={language} />
      </Suspense>
    </ViewportDeferred>
  );
}

export function DeferredPortfolioChart(props: ComponentProps<typeof PortfolioChartComponent>) {
  return (
    <ViewportDeferred fallback={<DeferredFallback minHeight={300} />}>
      <Suspense fallback={<DeferredFallback minHeight={300} />}>
        <PortfolioChart {...props} />
      </Suspense>
    </ViewportDeferred>
  );
}

export function DeferredHoldingsTable({
  canEdit,
  canRefresh,
  holdings,
  language,
}: {
  canEdit: boolean;
  canRefresh: boolean;
  holdings: HoldingRow[];
  language: UiLanguage;
}) {
  return (
    <ViewportDeferred fallback={<DeferredFallback minHeight={520} />}>
      <Suspense fallback={<DeferredFallback minHeight={520} />}>
        <HoldingsTable
          holdings={holdings}
          language={language}
          canEdit={canEdit}
          canRefresh={canRefresh}
        />
      </Suspense>
    </ViewportDeferred>
  );
}

export function DeferredMarketBenchmarks({
  language,
  monthlyReturns,
  quotes,
}: {
  language: UiLanguage;
  monthlyReturns: DashboardBenchmarkMonthlyReturn[];
  quotes: DashboardBenchmarkQuote[];
}) {
  return (
    <ViewportDeferred fallback={<DeferredFallback minHeight={320} />}>
      <Suspense fallback={<DeferredFallback minHeight={320} />}>
        <MarketBenchmarks language={language} monthlyReturns={monthlyReturns} quotes={quotes} />
      </Suspense>
    </ViewportDeferred>
  );
}
