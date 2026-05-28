import { normalizeMoney } from "@/lib/db/precision";
import type { HoldingsSnapshot } from "@/server/holdings";

export type DashboardPerformanceSummaryStatus =
  | "ready"
  | "no-transactions"
  | "mixed-currency"
  | "missing-market-value"
  | "no-positive-net-invested";

export type DashboardPerformanceSummary = {
  status: DashboardPerformanceSummaryStatus;
  currency: string | null;
  totalPnl: number | null;
  netInvested: number | null;
  absoluteReturn: number | null;
};

export function getCurrentLocalIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function buildPerformanceSummary({
  holdingsSnapshot,
  instrumentRows,
  today = getCurrentLocalIsoDate(),
  transactionRows,
}: {
  holdingsSnapshot: HoldingsSnapshot;
  instrumentRows: Array<{ id: number; currency: string }>;
  today?: string;
  transactionRows: Array<{
    instrumentId: number;
    tradeDate: string;
    side: string;
    quantity: number;
    price: number;
    fee: number;
  }>;
}): DashboardPerformanceSummary {
  const nonFutureTransactions = transactionRows.filter(
    (transaction) => transaction.tradeDate <= today,
  );

  if (nonFutureTransactions.length === 0) {
    return {
      status: "no-transactions",
      currency: null,
      totalPnl: null,
      netInvested: null,
      absoluteReturn: null,
    };
  }

  const instrumentsById = new Map(instrumentRows.map((instrument) => [instrument.id, instrument]));
  const currencies = Array.from(
    new Set(
      nonFutureTransactions
        .map((transaction) => instrumentsById.get(transaction.instrumentId)?.currency ?? null)
        .filter((currency): currency is string => currency != null),
    ),
  );
  const currency = currencies.length === 1 ? currencies[0] : null;

  if (currency == null) {
    return {
      status: "mixed-currency",
      currency: null,
      totalPnl: null,
      netInvested: null,
      absoluteReturn: null,
    };
  }

  let netInvested = 0;

  for (const transaction of nonFutureTransactions) {
    const grossAmount = normalizeMoney(transaction.quantity * transaction.price);

    netInvested = normalizeMoney(
      transaction.side === "BUY"
        ? netInvested + grossAmount + transaction.fee
        : netInvested - (grossAmount - transaction.fee),
    );
  }

  if (holdingsSnapshot.totalRealizedPnl == null || holdingsSnapshot.totalUnrealizedPnl == null) {
    return {
      status: "missing-market-value",
      currency,
      totalPnl: null,
      netInvested,
      absoluteReturn: null,
    };
  }

  const totalPnl = normalizeMoney(
    holdingsSnapshot.totalRealizedPnl + holdingsSnapshot.totalUnrealizedPnl,
  );
  const absoluteReturn = netInvested > 0 ? totalPnl / netInvested : null;

  return {
    status: absoluteReturn == null ? "no-positive-net-invested" : "ready",
    currency,
    totalPnl,
    netInvested,
    absoluteReturn,
  };
}
