import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/runtime-core";
import { historicalPrices, intradayPrices, priceSnapshots } from "@/lib/db/schema";
import { getExpectedHistoryTailDate } from "@/lib/market/freshness";
import type { MarketIntradayInterval } from "@/lib/market/types";
import type { RefreshTarget } from "@/lib/market/refresh-context";

export const INTRADAY_REFRESH_WINDOWS: Array<{
  interval: MarketIntradayInterval;
  lookbackDays: number;
}> = [
  { interval: "5m", lookbackDays: 2 },
  { interval: "1h", lookbackDays: 35 },
];

type HistoryCoverageTarget = {
  currency: string;
  instrumentId: number;
};

type HistoryCoverageRow = {
  currency: string;
  instrumentId: number;
  priceDate: string;
};

export function buildHistoryCoverageByInstrumentRows({
  rows,
  targets,
}: {
  rows: HistoryCoverageRow[];
  targets: HistoryCoverageTarget[];
}) {
  const targetByInstrumentId = new Map(
    targets.map((target) => [target.instrumentId, target] as const),
  );
  const coverageByInstrument = new Map<
    number,
    { earliestPriceDate: string | null; latestPriceDate: string | null }
  >();

  for (const row of rows) {
    const target = targetByInstrumentId.get(row.instrumentId);

    if (target == null || row.currency !== target.currency) {
      continue;
    }

    const existingCoverage = coverageByInstrument.get(row.instrumentId) ?? {
      earliestPriceDate: null,
      latestPriceDate: null,
    };

    coverageByInstrument.set(row.instrumentId, {
      earliestPriceDate:
        existingCoverage.earliestPriceDate == null ||
        row.priceDate < existingCoverage.earliestPriceDate
          ? row.priceDate
          : existingCoverage.earliestPriceDate,
      latestPriceDate:
        existingCoverage.latestPriceDate == null || row.priceDate > existingCoverage.latestPriceDate
          ? row.priceDate
          : existingCoverage.latestPriceDate,
    });
  }

  return coverageByInstrument;
}

export async function getHistoryCoverageByInstrument(targets: RefreshTarget[]) {
  const historyTargets = targets.filter((target) => target.historyStartDate != null);

  if (historyTargets.length === 0) {
    return new Map<number, { earliestPriceDate: string | null; latestPriceDate: string | null }>();
  }

  const historicalRows = await db
    .select()
    .from(historicalPrices)
    .where(
      inArray(
        historicalPrices.instrumentId,
        historyTargets.map((target) => target.instrument.id),
      ),
    );

  return buildHistoryCoverageByInstrumentRows({
    rows: historicalRows,
    targets: historyTargets.map((target) => ({
      currency: target.instrument.currency,
      instrumentId: target.instrument.id,
    })),
  });
}

export async function hasMissingIntradayData(targets: RefreshTarget[]) {
  if (targets.length === 0) {
    return false;
  }

  const rows = await db
    .select()
    .from(intradayPrices)
    .where(
      inArray(
        intradayPrices.instrumentId,
        targets.map((target) => target.instrument.id),
      ),
    );
  const intervalsByInstrumentId = new Map<number, Set<string>>();

  for (const row of rows) {
    const intervals = intervalsByInstrumentId.get(row.instrumentId) ?? new Set<string>();
    intervals.add(row.interval);
    intervalsByInstrumentId.set(row.instrumentId, intervals);
  }

  return targets.some((target) => {
    const intervals = intervalsByInstrumentId.get(target.instrument.id);

    return (
      intervals == null ||
      INTRADAY_REFRESH_WINDOWS.some((window) => !intervals.has(window.interval))
    );
  });
}

export async function hasIncompleteHistoricalData({
  targets,
  snapshotByInstrumentId,
}: {
  targets: RefreshTarget[];
  snapshotByInstrumentId: Map<number, typeof priceSnapshots.$inferSelect>;
}) {
  const historyTargets = targets.filter((target) => target.historyStartDate != null);
  const coverageByInstrument = await getHistoryCoverageByInstrument(historyTargets);

  return historyTargets.some((target) => {
    const coverage = coverageByInstrument.get(target.instrument.id);
    const snapshot = snapshotByInstrumentId.get(target.instrument.id);
    const expectedTailDate =
      snapshot != null && snapshot.currency === target.instrument.currency
        ? getExpectedHistoryTailDate(snapshot.asOf)
        : null;

    const isMissingStartCoverage =
      coverage == null ||
      coverage.earliestPriceDate == null ||
      coverage.earliestPriceDate > (target.historyStartDate ?? "");
    const isMissingTailCoverage =
      expectedTailDate != null &&
      (coverage == null ||
        coverage.latestPriceDate == null ||
        coverage.latestPriceDate < expectedTailDate);

    return isMissingStartCoverage || isMissingTailCoverage;
  });
}

export async function withIncrementalHistoryStartDates(targets: RefreshTarget[]) {
  const coverageByInstrument = await getHistoryCoverageByInstrument(targets);

  return targets.map((target) => {
    if (target.historyStartDate == null) {
      return target;
    }

    const coverage = coverageByInstrument.get(target.instrument.id);

    if (
      coverage == null ||
      coverage.earliestPriceDate == null ||
      coverage.latestPriceDate == null ||
      coverage.earliestPriceDate > target.historyStartDate
    ) {
      return target;
    }

    return {
      ...target,
      historyStartDate: coverage.latestPriceDate,
    };
  });
}
