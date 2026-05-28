import { normalizeMoney } from "@/lib/db/precision";
import type { Instrument, Portfolio, Transaction } from "@/lib/db/schema";
import type { TransactionBroker } from "@/lib/validation/transaction";

export type TransactionListItem = {
  id: number;
  portfolioId: number;
  instrumentId: number;
  tradeDate: string;
  side: "BUY" | "SELL";
  broker: TransactionBroker;
  quantity: number;
  price: number;
  fee: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  portfolioName: string | null;
  instrument: {
    id: number;
    symbol: string;
    displayName: string;
    market: string;
    instrumentType: string;
    currency: string;
    providerSymbol: string;
    underlyingProviderSymbol: string | null;
  };
  grossAmount: number;
  netAmount: number;
  signedQuantity: number;
};

export type TransactionInstrumentOption = {
  id: number;
  symbol: string;
  displayName: string;
  market: string;
  instrumentType: string;
  currency: string;
  providerSymbol: string | null;
  isActive: boolean;
  currentQuantity: number;
  label: string;
};

export function isTransactionInstrumentSelectable(instrument: TransactionInstrumentOption) {
  return instrument.isActive || instrument.currentQuantity > 0;
}

export function mapTransactionListItem(row: {
  transaction: Transaction;
  instrument: Instrument;
  portfolio?: Pick<Portfolio, "name">;
}): TransactionListItem {
  const grossAmount = normalizeMoney(row.transaction.quantity * row.transaction.price);
  const netAmount =
    row.transaction.side === "BUY"
      ? normalizeMoney(grossAmount + row.transaction.fee)
      : normalizeMoney(grossAmount - row.transaction.fee);

  return {
    id: row.transaction.id,
    portfolioId: row.transaction.portfolioId,
    instrumentId: row.transaction.instrumentId,
    tradeDate: row.transaction.tradeDate,
    side: row.transaction.side as "BUY" | "SELL",
    broker: row.transaction.broker as TransactionBroker,
    quantity: row.transaction.quantity,
    price: row.transaction.price,
    fee: row.transaction.fee,
    notes: row.transaction.notes,
    createdAt: row.transaction.createdAt,
    updatedAt: row.transaction.updatedAt,
    portfolioName: row.portfolio?.name ?? null,
    instrument: {
      id: row.instrument.id,
      symbol: row.instrument.symbol,
      displayName: row.instrument.displayName,
      market: row.instrument.market,
      instrumentType: row.instrument.instrumentType,
      currency: row.instrument.currency,
      providerSymbol: row.instrument.providerSymbol,
      underlyingProviderSymbol: row.instrument.underlyingProviderSymbol,
    },
    grossAmount,
    netAmount,
    signedQuantity:
      row.transaction.side === "BUY" ? row.transaction.quantity : -row.transaction.quantity,
  };
}

export function mapInstrumentOption(
  instrument: Instrument,
  currentQuantity = 0,
): TransactionInstrumentOption {
  return {
    id: instrument.id,
    symbol: instrument.symbol,
    displayName: instrument.displayName,
    market: instrument.market,
    instrumentType: instrument.instrumentType,
    currency: instrument.currency,
    providerSymbol: instrument.providerSymbol,
    isActive: instrument.isActive,
    currentQuantity,
    label: `${instrument.symbol} - ${instrument.displayName} - ${instrument.market} - ${instrument.currency}`,
  };
}
