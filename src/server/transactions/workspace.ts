import { sortInstrumentOptions } from "@/lib/transactions/instrument-selection";
import type { Instrument, Portfolio, Transaction } from "@/lib/db/schema";
import { calculatePositions } from "@/lib/portfolio/positions";
import {
  isTransactionInstrumentSelectable,
  mapInstrumentOption,
  mapTransactionListItem,
} from "@/server/transactions/mappers";
import type {
  TransactionInstrumentOption,
  TransactionListItem,
} from "@/server/transactions/mappers";

type TransactionWorkspaceRow = {
  transaction: Transaction;
  instrument: Instrument;
  portfolio?: Pick<Portfolio, "name">;
};

type TransactionWorkspaceModel = {
  allInstruments: TransactionInstrumentOption[];
  editingTransaction: TransactionListItem | null;
  formInstruments: TransactionInstrumentOption[];
  instruments: TransactionInstrumentOption[];
  summary: {
    allInstrumentCount: number;
    latestTradeDate: string | null;
    openInstrumentCount: number;
    selectableInstrumentCount: number;
    transactionCount: number;
    uniqueInstrumentCount: number;
  };
  transactions: TransactionListItem[];
};

function toPositionTransaction(row: Transaction) {
  return {
    instrumentId: row.instrumentId,
    tradeDate: row.tradeDate,
    side: row.side as "BUY" | "SELL",
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    createdAt: row.createdAt,
    id: row.id,
  };
}

export function buildTransactionWorkspaceModel({
  editTransactionId,
  includeEditingInstrumentInForm,
  instrumentRows,
  transactionRows,
}: {
  editTransactionId: number | null;
  includeEditingInstrumentInForm: boolean;
  instrumentRows: Instrument[];
  transactionRows: TransactionWorkspaceRow[];
}): TransactionWorkspaceModel {
  const transactionsList = transactionRows.map(mapTransactionListItem);
  const positions = calculatePositions(
    transactionRows.map((row) => toPositionTransaction(row.transaction)),
  );
  const allInstruments = instrumentRows.map((instrument) =>
    mapInstrumentOption(instrument, positions.get(instrument.id)?.quantity ?? 0),
  );
  const selectableInstruments = allInstruments.filter(isTransactionInstrumentSelectable);
  const editingTransaction =
    editTransactionId == null
      ? null
      : (transactionsList.find((transaction) => transaction.id === editTransactionId) ?? null);
  const formInstruments =
    includeEditingInstrumentInForm &&
    editingTransaction &&
    !selectableInstruments.some((instrument) => instrument.id === editingTransaction.instrumentId)
      ? sortInstrumentOptions([
          ...selectableInstruments,
          ...allInstruments.filter(
            (instrument) => instrument.id === editingTransaction.instrumentId,
          ),
        ])
      : selectableInstruments;

  return {
    allInstruments,
    editingTransaction,
    formInstruments,
    instruments: selectableInstruments,
    summary: {
      allInstrumentCount: allInstruments.length,
      latestTradeDate: transactionsList[0]?.tradeDate ?? null,
      openInstrumentCount: allInstruments.filter((instrument) => instrument.currentQuantity > 0)
        .length,
      selectableInstrumentCount: selectableInstruments.length,
      transactionCount: transactionsList.length,
      uniqueInstrumentCount: new Set(
        transactionsList.map((transaction) => transaction.instrumentId),
      ).size,
    },
    transactions: transactionsList,
  };
}
