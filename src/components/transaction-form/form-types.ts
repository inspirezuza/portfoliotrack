import type { TransactionBroker } from "@/lib/validation/transaction";
import type { TransactionInstrumentOption } from "@/server/transactions";

export type TransactionFormValues = {
  instrumentId: string;
  tradeDate: string;
  side: "BUY" | "SELL";
  broker: TransactionBroker;
  quantity: string;
  price: string;
  fee: string;
  notes: string;
};

export type NewInstrumentFormValues = {
  symbol: string;
  displayName: string;
  market: string;
  instrumentType: string;
  currency: string;
  providerSymbol: string;
};

export type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
    details?: {
      availableQuantity?: number;
      issues?: {
        fieldErrors?: Record<string, string[] | undefined>;
        formErrors?: string[];
      };
    } | null;
  };
};

export type InstrumentApiResponse = ApiErrorResponse & {
  instrument?: TransactionInstrumentOption;
};

export type InstrumentSearchResult = NewInstrumentFormValues & {
  exchangeName: string | null;
};

export type InstrumentSearchApiResponse = ApiErrorResponse & {
  results?: InstrumentSearchResult[];
};

export type TransactionRequestBody = {
  id?: number;
  portfolioId?: number;
  instrumentId: number;
  tradeDate: string;
  side: TransactionFormValues["side"];
  broker: TransactionBroker;
  quantity: number;
  price: number;
  fee: number;
  notes: string;
};

export type TransactionFormSyncState = {
  values: TransactionFormValues;
  instrumentSearch?: string;
  highlightedInstrumentId?: string | null;
  isInstrumentComboboxOpen?: boolean;
  errorMessage?: string | null;
  successMessage?: string | null;
};
