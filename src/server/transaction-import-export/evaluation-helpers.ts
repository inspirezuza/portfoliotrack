import type { ParsedTransactionExcelRow } from "@/lib/transactions/excel";
import type { TransactionBroker } from "@/lib/validation/transaction";
import {
  getImportTransactionKey,
  getOptionalCellString,
  getOptionalNumber,
  normalizeLookupValue,
} from "@/server/transaction-import-export/import-helpers";
import type { ImportInstrument } from "@/server/transaction-import-export/instrument-resolution";
import type {
  ImportTransactionInput,
  ReadyImportRow,
  ResolvedImportInstrument,
  TransactionImportPreview,
  TransactionImportPreviewRow,
} from "@/server/transaction-import-export/types";

type ImportDuplicateTransaction = {
  id: number;
  instrumentId: number;
  tradeDate: string;
  side: string;
  broker: string;
  quantity: number;
  price: number;
  fee: number;
  notes: string | null;
  createdAt: string;
};

type BuildReadyImportPreviewRowParams = {
  createInstrumentInput?: ReadyImportRow["createInstrumentInput"];
  duplicateKey: string;
  input: ImportTransactionInput;
  instrumentKey: string;
  resolvedInstrument: ResolvedImportInstrument;
  rowNumber: number;
};

export function buildImportInstrumentLookupMaps(instruments: ImportInstrument[]) {
  return {
    instrumentById: new Map(instruments.map((instrument) => [instrument.id, instrument])),
    instrumentByProviderSymbol: new Map(
      instruments.map((instrument) => [
        normalizeLookupValue(instrument.providerSymbol),
        instrument,
      ]),
    ),
    instrumentBySymbol: new Map(
      instruments.map((instrument) => [normalizeLookupValue(instrument.symbol), instrument]),
    ),
  };
}

export function buildDuplicateImportKeys(transactions: ImportDuplicateTransaction[]) {
  return new Set(
    transactions.map((transaction) =>
      getImportTransactionKey(
        {
          ...transaction,
          side: transaction.side as "BUY" | "SELL",
          broker: transaction.broker as TransactionBroker,
        },
        transaction.instrumentId,
      ),
    ),
  );
}

export function buildBaseImportPreviewRow(
  row: ParsedTransactionExcelRow,
  resolvedInstrument: ResolvedImportInstrument | null,
) {
  return {
    rowNumber: row.rowNumber,
    symbol: (resolvedInstrument?.symbol ?? getOptionalCellString(row.values.symbol)) || null,
    tradeDate: getOptionalCellString(row.values.tradeDate) || null,
    side:
      normalizeLookupValue(row.values.side) === "BUY" ||
      normalizeLookupValue(row.values.side) === "SELL"
        ? (normalizeLookupValue(row.values.side) as "BUY" | "SELL")
        : null,
    broker:
      normalizeLookupValue(row.values.broker) === "DIME" ||
      normalizeLookupValue(row.values.broker) === "WEBULL"
        ? (normalizeLookupValue(row.values.broker) as TransactionBroker)
        : null,
    quantity: getOptionalNumber(row.values.quantity),
    price: getOptionalNumber(row.values.price),
    fee: getOptionalNumber(row.values.fee),
    notes: getOptionalCellString(row.values.notes) || null,
  };
}

export function buildDuplicateImportPreviewRow({
  input,
  resolvedInstrument,
  rowNumber,
}: {
  input: ImportTransactionInput;
  resolvedInstrument: ResolvedImportInstrument;
  rowNumber: number;
}): TransactionImportPreviewRow {
  return {
    rowNumber,
    status: "skipped_duplicate",
    message: "Duplicate transaction was skipped.",
    symbol: resolvedInstrument.symbol,
    tradeDate: input.tradeDate,
    side: input.side,
    broker: input.broker ?? "DIME",
    quantity: input.quantity,
    price: input.price,
    fee: input.fee,
    notes: input.notes,
  };
}

export function buildReadyImportPreviewRow({
  createInstrumentInput,
  duplicateKey,
  input,
  instrumentKey,
  resolvedInstrument,
  rowNumber,
}: BuildReadyImportPreviewRowParams): ReadyImportRow {
  return {
    rowNumber,
    status: "ready",
    message:
      resolvedInstrument.id == null
        ? `Ready to import. ${resolvedInstrument.symbol} will be created.`
        : "Ready to import.",
    symbol: resolvedInstrument.symbol,
    tradeDate: input.tradeDate,
    side: input.side,
    broker: input.broker ?? "DIME",
    quantity: input.quantity,
    price: input.price,
    fee: input.fee,
    notes: input.notes,
    input,
    duplicateKey,
    instrumentKey,
    positionInstrumentId: resolvedInstrument.id ?? resolvedInstrument.positionInstrumentId,
    createInstrumentInput,
    createInstrumentKey:
      resolvedInstrument.id == null ? resolvedInstrument.createInstrumentKey : undefined,
  };
}

export function buildImportEvaluationPreview({
  parsedRowsCount,
  readyRows,
  rows,
}: {
  parsedRowsCount: number;
  readyRows: ReadyImportRow[];
  rows: TransactionImportPreviewRow[];
}): TransactionImportPreview {
  const previewRows = [...rows, ...readyRows].sort(
    (left, right) => left.rowNumber - right.rowNumber,
  );

  return {
    counts: {
      totalRows: parsedRowsCount,
      readyRows: readyRows.length,
      skippedRows: previewRows.filter((row) => row.status === "skipped_duplicate").length,
      errorRows: previewRows.filter((row) => row.status === "error").length,
    },
    rows: previewRows,
  };
}
