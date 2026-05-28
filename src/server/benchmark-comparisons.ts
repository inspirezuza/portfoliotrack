import "server-only";

import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import { historicalPrices, instruments, intradayPrices, priceSnapshots } from "@/lib/db/schema";
import { refreshMarketDataTargets } from "@/lib/market/provider";
import { instrumentInputSchema, type InstrumentInput } from "@/lib/validation/instrument";
import { createInstrument, InstrumentServiceError } from "@/server/transactions";
import type { TimelinePointInterval } from "@/lib/portfolio/timeline";

const COMPARISON_HISTORY_START_DATE = "2020-01-01";

export type BenchmarkComparisonQuote = {
  symbol: string;
  displayName: string;
  providerSymbol: string;
  market: string;
  currency: string;
  price: number | null;
  asOf: string | null;
  dailyChange: number | null;
  dailyChangePercent: number | null;
};

export type BenchmarkComparisonOverlayPoint = {
  date: string;
  value: number;
  interval: TimelinePointInterval | null;
};

export type BenchmarkComparisonOverlay = {
  symbol: string;
  displayName: string;
  providerSymbol: string;
  market: string;
  currency: string;
  points: BenchmarkComparisonOverlayPoint[];
};

export type BenchmarkComparisonPayload = {
  overlay: BenchmarkComparisonOverlay;
  quote: BenchmarkComparisonQuote;
};

type InstrumentRow = typeof instruments.$inferSelect;
type HistoricalPriceRow = typeof historicalPrices.$inferSelect;
type IntradayPriceRow = typeof intradayPrices.$inferSelect;
type PriceSnapshotRow = typeof priceSnapshots.$inferSelect;

export class BenchmarkComparisonServiceError extends Error {
  readonly code:
    | "VALIDATION_ERROR"
    | "INSTRUMENT_NOT_FOUND"
    | "MARKET_DATA_UNAVAILABLE"
    | "INTERNAL_ERROR";
  readonly details?: Record<string, unknown>;

  constructor(
    code: BenchmarkComparisonServiceError["code"],
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BenchmarkComparisonServiceError";
    this.code = code;
    this.details = details;
  }
}

function isTimelineIntradayInterval(value: string): value is TimelinePointInterval {
  return value === "5m" || value === "15m" || value === "1h";
}

function calculateReturnPercent(startValue: number | null, endValue: number | null) {
  if (startValue == null || endValue == null || startValue === 0) {
    return null;
  }

  return ((endValue - startValue) / startValue) * 100;
}

function parseInstrumentInput(input: unknown): InstrumentInput {
  const result = instrumentInputSchema.safeParse(input);

  if (!result.success) {
    throw new BenchmarkComparisonServiceError(
      "VALIDATION_ERROR",
      "Comparison instrument is invalid.",
      {
        issues: result.error.flatten(),
      },
    );
  }

  return result.data;
}

async function findInstrumentByIdentity({ providerSymbol, symbol }: InstrumentInput) {
  const [instrument] = await db
    .select()
    .from(instruments)
    .where(or(eq(instruments.symbol, symbol), eq(instruments.providerSymbol, providerSymbol)))
    .limit(1);

  return instrument ?? null;
}

async function reloadInstrumentById(instrumentId: number) {
  const [instrument] = await db.select().from(instruments).where(eq(instruments.id, instrumentId));

  return instrument ?? null;
}

async function ensureComparisonInstrument(input: unknown) {
  const parsedInput = parseInstrumentInput(input);
  const existingInstrument = await findInstrumentByIdentity(parsedInput);

  if (existingInstrument != null) {
    return existingInstrument;
  }

  try {
    const createdInstrument = await createInstrument(parsedInput);
    const instrument = await reloadInstrumentById(createdInstrument.id);

    if (instrument == null) {
      throw new BenchmarkComparisonServiceError(
        "INSTRUMENT_NOT_FOUND",
        "Comparison instrument was created but could not be loaded.",
      );
    }

    return instrument;
  } catch (error) {
    if (error instanceof InstrumentServiceError && error.code === "DUPLICATE_INSTRUMENT") {
      const instrument = await findInstrumentByIdentity(parsedInput);

      if (instrument != null) {
        return instrument;
      }
    }

    if (error instanceof InstrumentServiceError && error.code === "VALIDATION_ERROR") {
      throw new BenchmarkComparisonServiceError("VALIDATION_ERROR", error.message, error.details);
    }

    if (error instanceof BenchmarkComparisonServiceError) {
      throw error;
    }

    throw new BenchmarkComparisonServiceError(
      "INTERNAL_ERROR",
      "Comparison instrument could not be saved.",
    );
  }
}

export function buildBenchmarkComparisonPayload({
  historicalPriceRows,
  instrument,
  intradayPriceRows,
  priceSnapshotRows,
}: {
  historicalPriceRows: HistoricalPriceRow[];
  instrument: InstrumentRow;
  intradayPriceRows: IntradayPriceRow[];
  priceSnapshotRows: PriceSnapshotRow[];
}): BenchmarkComparisonPayload {
  const historyRows = historicalPriceRows
    .filter((row) => row.instrumentId === instrument.id && row.currency === instrument.currency)
    .sort((left, right) => left.priceDate.localeCompare(right.priceDate));
  const intradayRows = intradayPriceRows
    .filter(
      (row) =>
        row.instrumentId === instrument.id &&
        row.currency === instrument.currency &&
        isTimelineIntradayInterval(row.interval),
    )
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  const snapshot =
    priceSnapshotRows.find(
      (row) => row.instrumentId === instrument.id && row.currency === instrument.currency,
    ) ?? null;
  const latestHistory = historyRows[historyRows.length - 1] ?? null;
  const previousHistory = historyRows[historyRows.length - 2] ?? null;
  const price = snapshot?.price ?? latestHistory?.close ?? null;
  const previousClose = previousHistory?.close ?? null;
  const dailyPoints: BenchmarkComparisonOverlayPoint[] = historyRows.map((row) => ({
    date: row.priceDate,
    interval: "1d",
    value: row.close,
  }));
  const intradayPoints: BenchmarkComparisonOverlayPoint[] = intradayRows.map((row) => ({
    date: row.observedAt,
    interval: row.interval as TimelinePointInterval,
    value: row.close,
  }));

  return {
    overlay: {
      symbol: instrument.symbol,
      displayName: instrument.displayName,
      providerSymbol: instrument.providerSymbol,
      market: instrument.market,
      currency: instrument.currency,
      points: [...dailyPoints, ...intradayPoints].sort((left, right) =>
        left.date.localeCompare(right.date),
      ),
    },
    quote: {
      symbol: instrument.symbol,
      displayName: instrument.displayName,
      providerSymbol: instrument.providerSymbol,
      market: instrument.market,
      currency: instrument.currency,
      price,
      asOf: snapshot?.asOf ?? latestHistory?.priceDate ?? null,
      dailyChange: price == null || previousClose == null ? null : price - previousClose,
      dailyChangePercent: calculateReturnPercent(previousClose, price),
    },
  };
}

async function loadComparisonPayload(instrument: InstrumentRow) {
  const [historicalPriceRows, intradayPriceRows, priceSnapshotRows] = await Promise.all([
    db.select().from(historicalPrices).where(eq(historicalPrices.instrumentId, instrument.id)),
    db.select().from(intradayPrices).where(eq(intradayPrices.instrumentId, instrument.id)),
    db.select().from(priceSnapshots).where(eq(priceSnapshots.instrumentId, instrument.id)),
  ]);

  return buildBenchmarkComparisonPayload({
    historicalPriceRows,
    instrument,
    intradayPriceRows,
    priceSnapshotRows,
  });
}

export async function ensureBenchmarkComparison(input: unknown) {
  const instrument = await ensureComparisonInstrument(input);

  await refreshMarketDataTargets({
    targets: [
      {
        instrument,
        historyStartDate: COMPARISON_HISTORY_START_DATE,
      },
    ],
  });

  const payload = await loadComparisonPayload(instrument);

  if (payload.overlay.points.length < 2) {
    throw new BenchmarkComparisonServiceError(
      "MARKET_DATA_UNAVAILABLE",
      "Comparison history is unavailable for this symbol.",
    );
  }

  return payload;
}
