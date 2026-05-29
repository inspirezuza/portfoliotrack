import type { HoldingLot, HoldingRow } from "@/server/holdings";
import type { TransactionInstrumentOption, TransactionListItem } from "@/server/transactions";
import type { TransactionBroker } from "@/lib/validation/transaction";

export function getHoldingLotInstrumentOption(holding: HoldingRow): TransactionInstrumentOption {
  return {
    id: holding.instrumentId,
    symbol: holding.symbol,
    displayName: holding.displayName,
    market: holding.market,
    instrumentType: holding.instrumentType,
    currency: holding.currency,
    providerSymbol: holding.providerSymbol,
    isActive: true,
    currentQuantity: holding.quantity,
    label: `${holding.symbol} - ${holding.displayName} - ${holding.market} - ${holding.currency}`,
  };
}

export function getHoldingLotTransaction(
  holding: HoldingRow,
  lot: HoldingLot,
): TransactionListItem {
  const grossAmount = lot.originalQuantity * lot.price;
  const netAmount = lot.side === "BUY" ? grossAmount + lot.fee : grossAmount - lot.fee;

  return {
    id: lot.transactionId,
    portfolioId: lot.portfolioId,
    instrumentId: lot.instrumentId,
    tradeDate: lot.tradeDate,
    side: lot.side,
    broker: lot.broker as TransactionBroker,
    quantity: lot.originalQuantity,
    price: lot.price,
    fee: lot.fee,
    notes: lot.notes,
    createdAt: lot.createdAt,
    updatedAt: lot.updatedAt,
    portfolioName: lot.portfolioName,
    instrument: {
      id: holding.instrumentId,
      symbol: holding.symbol,
      displayName: holding.displayName,
      market: holding.market,
      instrumentType: holding.instrumentType,
      currency: holding.currency,
      providerSymbol: holding.providerSymbol,
      underlyingProviderSymbol: holding.underlyingProviderSymbol,
    },
    grossAmount,
    netAmount,
    signedQuantity: lot.side === "BUY" ? lot.originalQuantity : -lot.originalQuantity,
  };
}
