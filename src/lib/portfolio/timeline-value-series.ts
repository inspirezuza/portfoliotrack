import { normalizeMoney, normalizeQuantity } from "@/lib/db/precision";
import {
  applyTransaction,
  sortTransactionsChronologically,
  type InstrumentPosition,
} from "@/lib/portfolio/positions";
import { type PortfolioValuationPoint } from "@/lib/portfolio/timeline-comparison";
import {
  advancePriceState,
  buildPriceStates,
  getTimelineAnchors,
  toDailyPricePoints,
  toDayStartTimestamp,
  toIntradayPricePoints,
  toTradeDay,
} from "@/lib/portfolio/timeline-price-points";
import type {
  TimelineHistoricalPrice,
  TimelineIntradayPrice,
  TimelineTransaction,
} from "@/lib/portfolio/timeline-types";

function createEmptyPosition(instrumentId: number): InstrumentPosition {
  return {
    instrumentId,
    quantity: 0,
    averageCost: 0,
    totalCost: 0,
    realizedPnl: 0,
    totalFees: 0,
  };
}

function getExternalCashFlow(transaction: TimelineTransaction) {
  const grossAmount = normalizeMoney(transaction.quantity * transaction.price);

  return transaction.side === "BUY"
    ? normalizeMoney(grossAmount + transaction.fee)
    : normalizeMoney(-(grossAmount - transaction.fee));
}

export function buildPortfolioValueSeries({
  baselineDate,
  transactions,
  historicalPrices,
  intradayPrices = [],
}: {
  baselineDate: string;
  transactions: TimelineTransaction[];
  historicalPrices: TimelineHistoricalPrice[];
  intradayPrices?: TimelineIntradayPrice[];
}) {
  const orderedTransactions = sortTransactionsChronologically(transactions);
  const baselineAt = toDayStartTimestamp(baselineDate);
  const pricePoints = [
    ...toDailyPricePoints(historicalPrices),
    ...toIntradayPricePoints(intradayPrices),
  ];
  const priceAnchors = getTimelineAnchors(pricePoints.filter((row) => row.priceAt >= baselineAt));
  const priceStates = buildPriceStates(pricePoints);
  const positions = new Map<number, InstrumentPosition>();
  const series: PortfolioValuationPoint[] = [];
  let transactionIndex = 0;
  let pendingCashFlow = 0;
  // Net units transacted (signed: + for buys, - for sells) accumulated since the last emitted
  // point, keyed by instrument. Used to value the day's flow at its closing price.
  const pendingFlowUnits = new Map<number, number>();

  for (const anchor of priceAnchors) {
    const date = anchor.priceAt;

    while (
      transactionIndex < orderedTransactions.length &&
      orderedTransactions[transactionIndex].tradeDate <= toTradeDay(date)
    ) {
      const transaction = orderedTransactions[transactionIndex];
      const position =
        positions.get(transaction.instrumentId) ?? createEmptyPosition(transaction.instrumentId);

      applyTransaction(position, transaction);
      positions.set(transaction.instrumentId, position);
      pendingCashFlow = normalizeMoney(pendingCashFlow + getExternalCashFlow(transaction));
      const signedUnits = transaction.side === "BUY" ? transaction.quantity : -transaction.quantity;
      pendingFlowUnits.set(
        transaction.instrumentId,
        normalizeQuantity((pendingFlowUnits.get(transaction.instrumentId) ?? 0) + signedUnits),
      );
      transactionIndex += 1;
    }

    // Resolve a closing price for every instrument that is either an open position or has a
    // pending flow this period. Fall back to the position's cost basis (average cost) when no
    // market price exists yet, so a freshly bought, not-yet-priced holding is valued neutrally
    // instead of freezing the entire portfolio timeline. advancePriceState is idempotent within a
    // date, so it is safe to call once per relevant instrument here.
    const relevantInstrumentIds = new Set<number>();
    for (const [instrumentId, position] of positions) {
      if (position.quantity > 0) {
        relevantInstrumentIds.add(instrumentId);
      }
    }
    for (const instrumentId of pendingFlowUnits.keys()) {
      relevantInstrumentIds.add(instrumentId);
    }

    const closeByInstrument = new Map<number, number>();
    for (const instrumentId of relevantInstrumentIds) {
      const marketClose = advancePriceState(priceStates.get(instrumentId), date);
      const fallbackClose = positions.get(instrumentId)?.averageCost ?? 0;
      const close = marketClose ?? (fallbackClose > 0 ? fallbackClose : null);

      if (close != null) {
        closeByInstrument.set(instrumentId, close);
      }
    }

    let totalValue = 0;
    let hasOpenPosition = false;

    for (const position of positions.values()) {
      if (position.quantity <= 0) {
        continue;
      }

      hasOpenPosition = true;
      const close = closeByInstrument.get(position.instrumentId);

      if (close == null) {
        continue;
      }

      totalValue = normalizeMoney(totalValue + position.quantity * close);
    }

    let netFlowValueAtClose = 0;
    for (const [instrumentId, units] of pendingFlowUnits) {
      const close = closeByInstrument.get(instrumentId);

      if (close == null) {
        continue;
      }

      netFlowValueAtClose = normalizeMoney(netFlowValueAtClose + units * close);
    }

    if (hasOpenPosition || pendingCashFlow !== 0) {
      series.push({
        date,
        interval: anchor.interval,
        value: totalValue,
        netCashFlow: pendingCashFlow,
        netFlowValueAtClose,
      });
      pendingCashFlow = 0;
      pendingFlowUnits.clear();
    }
  }

  if (series.length === 0) {
    return [];
  }

  return series;
}
