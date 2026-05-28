import { normalizeMoney, normalizePrice, normalizeQuantity } from "@/lib/db/precision";
import {
  sortTransactionsChronologically,
  type PositionTransaction,
} from "@/lib/portfolio/positions";
import type { HoldingLot } from "@/server/holdings";

export type HoldingLotTransaction = PositionTransaction & {
  broker: string;
  notes: string | null;
  portfolioId: number;
  portfolioName: string | null;
  updatedAt: string;
};

type WorkingHoldingLot = HoldingLotTransaction & {
  originalFee: number;
  originalQuantity: number;
  remainingQuantity: number;
};

function calculateLotCostBasis(lot: WorkingHoldingLot) {
  if (lot.originalQuantity <= 0 || lot.remainingQuantity <= 0) {
    return 0;
  }

  const feeShare = normalizeMoney(lot.originalFee * (lot.remainingQuantity / lot.originalQuantity));

  return normalizeMoney(lot.remainingQuantity * lot.price + feeShare);
}

function toHoldingLot({
  fxRateToValuationCurrency,
  lastPrice,
  lot,
}: {
  fxRateToValuationCurrency: number | null;
  lastPrice: number | null;
  lot: WorkingHoldingLot;
}): HoldingLot {
  const costBasis = calculateLotCostBasis(lot);
  const marketValue = lastPrice == null ? null : normalizeMoney(lot.remainingQuantity * lastPrice);
  const totalGain = marketValue == null ? null : normalizeMoney(marketValue - costBasis);

  return {
    transactionId: lot.id ?? 0,
    instrumentId: lot.instrumentId,
    portfolioId: lot.portfolioId,
    portfolioName: lot.portfolioName,
    tradeDate: lot.tradeDate,
    side: lot.side,
    broker: lot.broker,
    originalQuantity: lot.originalQuantity,
    remainingQuantity: lot.remainingQuantity,
    price: lot.price,
    fee: lot.originalFee,
    notes: lot.notes,
    createdAt: lot.createdAt ?? "",
    updatedAt: lot.updatedAt,
    costBasis,
    costBasisInValuationCurrency:
      fxRateToValuationCurrency == null
        ? null
        : normalizeMoney(costBasis * fxRateToValuationCurrency),
    marketValue,
    marketValueInValuationCurrency:
      marketValue == null || fxRateToValuationCurrency == null
        ? null
        : normalizeMoney(marketValue * fxRateToValuationCurrency),
    totalGain,
    totalGainInValuationCurrency:
      totalGain == null || fxRateToValuationCurrency == null
        ? null
        : normalizeMoney(totalGain * fxRateToValuationCurrency),
    totalGainPercent: costBasis > 0 && totalGain != null ? totalGain / costBasis : null,
  };
}

export function buildOpenHoldingLots({
  fxRateToValuationCurrency,
  lastPrice,
  transactions,
}: {
  fxRateToValuationCurrency: number | null;
  lastPrice: number | null;
  transactions: HoldingLotTransaction[];
}) {
  const lots: WorkingHoldingLot[] = [];

  for (const transaction of sortTransactionsChronologically(transactions)) {
    const quantity = normalizeQuantity(transaction.quantity);

    if (transaction.side === "BUY") {
      lots.push({
        ...transaction,
        fee: normalizeMoney(transaction.fee),
        originalFee: normalizeMoney(transaction.fee),
        originalQuantity: quantity,
        price: normalizePrice(transaction.price),
        quantity,
        remainingQuantity: quantity,
      });
      continue;
    }

    let remainingSellQuantity = quantity;

    for (const lot of lots) {
      if (remainingSellQuantity <= 0) {
        break;
      }

      if (lot.portfolioId !== transaction.portfolioId) {
        continue;
      }

      const consumedQuantity = Math.min(lot.remainingQuantity, remainingSellQuantity);

      lot.remainingQuantity = normalizeQuantity(lot.remainingQuantity - consumedQuantity);
      remainingSellQuantity = normalizeQuantity(remainingSellQuantity - consumedQuantity);
    }
  }

  return lots
    .filter((lot) => lot.remainingQuantity > 0)
    .map((lot) => toHoldingLot({ fxRateToValuationCurrency, lastPrice, lot }));
}
