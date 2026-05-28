import type { InstrumentInput } from "@/lib/validation/instrument";
import type { TransactionBroker, TransactionInput } from "@/lib/validation/transaction";
import type { ImportInstrument } from "@/server/transaction-import-export/instrument-resolution";

export type ImportRowStatus = "ready" | "skipped_duplicate" | "error";

export type TransactionImportPreviewRow = {
  rowNumber: number;
  status: ImportRowStatus;
  message: string;
  symbol: string | null;
  tradeDate: string | null;
  side: "BUY" | "SELL" | null;
  broker: TransactionBroker | null;
  quantity: number | null;
  price: number | null;
  fee: number | null;
  notes: string | null;
};

export type TransactionImportPreview = {
  counts: {
    totalRows: number;
    readyRows: number;
    skippedRows: number;
    errorRows: number;
  };
  rows: TransactionImportPreviewRow[];
};

export type ImportTransactionInput = Omit<TransactionInput, "instrumentId"> & {
  instrumentId: number | null;
};

export type ReadyImportRow = TransactionImportPreviewRow & {
  status: "ready";
  input: ImportTransactionInput;
  duplicateKey: string;
  instrumentKey: string;
  positionInstrumentId: number;
  createInstrumentInput?: InstrumentInput;
  createInstrumentKey?: string;
};

export type PendingImportInstrument = Omit<ImportInstrument, "id"> & {
  id: null;
  createInstrumentInput: InstrumentInput;
  createInstrumentKey: string;
  positionInstrumentId: null;
};

export type PreparedPendingImportInstrument = Omit<
  PendingImportInstrument,
  "positionInstrumentId"
> & {
  positionInstrumentId: number;
};

export type ResolvedImportInstrument = ImportInstrument | PreparedPendingImportInstrument;
