import { normalizeMoney } from "@/lib/db/precision";
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
      transactionIndex += 1;
    }

    let totalValue = 0;
    let canValuePortfolio = true;
    let hasOpenPosition = false;

    for (const position of positions.values()) {
      if (position.quantity <= 0) {
        continue;
      }

      hasOpenPosition = true;
      const close = advancePriceState(priceStates.get(position.instrumentId), date);

      if (close == null) {
        canValuePortfolio = false;
        break;
      }

      totalValue = normalizeMoney(totalValue + position.quantity * close);
    }

    if (canValuePortfolio && (hasOpenPosition || pendingCashFlow !== 0)) {
      series.push({
        date,
        interval: anchor.interval,
        value: totalValue,
        netCashFlow: pendingCashFlow,
      });
      pendingCashFlow = 0;
    }
  }

  if (series.length === 0) {
    return [];
  }

  return series;
}
