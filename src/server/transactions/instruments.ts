import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import { instruments, transactions } from "@/lib/db/schema";
import { getKnownDrMetadata } from "@/lib/instruments/dr-metadata";
import { normalizeInstrumentType } from "@/lib/instruments/instrument-types";
import { calculatePositions } from "@/lib/portfolio/positions";
import { parsePortfolioId } from "@/server/portfolios";
import { InstrumentServiceError } from "@/server/transactions/errors";
import { parseInstrumentInput } from "@/server/transactions/input";
import {
  isTransactionInstrumentSelectable,
  mapInstrumentOption,
  type TransactionInstrumentOption,
} from "@/server/transactions/mappers";
import { toChronologicalPositionTransaction } from "@/server/transactions/position-validation";

function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "23505";
}

export async function createInstrument(input: unknown) {
  const parsedInput = parseInstrumentInput(input);
  const knownDrMetadata = getKnownDrMetadata(parsedInput);

  try {
    const [instrument] = await db
      .insert(instruments)
      .values({
        symbol: parsedInput.symbol,
        displayName: parsedInput.displayName,
        market: parsedInput.market,
        instrumentType:
          knownDrMetadata?.instrumentType ?? normalizeInstrumentType(parsedInput.instrumentType),
        currency: parsedInput.currency,
        providerSymbol: parsedInput.providerSymbol,
        underlyingSymbol: knownDrMetadata?.underlyingSymbol ?? null,
        underlyingDisplayName: knownDrMetadata?.underlyingDisplayName ?? null,
        underlyingCurrency: knownDrMetadata?.underlyingCurrency ?? null,
        underlyingProviderSymbol: knownDrMetadata?.underlyingProviderSymbol ?? null,
        drRatio: knownDrMetadata?.drRatio ?? null,
        fxProviderSymbol: knownDrMetadata?.fxProviderSymbol ?? null,
        isActive: true,
      })
      .returning();

    return mapInstrumentOption(instrument);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new InstrumentServiceError(
        "DUPLICATE_INSTRUMENT",
        "An instrument with that app symbol or provider symbol already exists.",
        {
          symbol: parsedInput.symbol,
          providerSymbol: parsedInput.providerSymbol,
        },
      );
    }

    throw error;
  }
}

export async function listTransactionInstrumentOptions({
  portfolioId: portfolioIdInput,
  activeOnly = true,
}: {
  portfolioId: number;
  activeOnly?: boolean;
}): Promise<TransactionInstrumentOption[]> {
  const portfolioId = parsePortfolioId(portfolioIdInput);
  const instrumentRows = activeOnly
    ? await db
        .select()
        .from(instruments)
        .where(eq(instruments.isActive, true))
        .orderBy(asc(instruments.symbol))
    : await db.select().from(instruments).orderBy(asc(instruments.symbol));

  const positionRows = await db
    .select({
      id: transactions.id,
      instrumentId: transactions.instrumentId,
      tradeDate: transactions.tradeDate,
      side: transactions.side,
      quantity: transactions.quantity,
      price: transactions.price,
      fee: transactions.fee,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(eq(transactions.portfolioId, portfolioId))
    .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id));

  const positions = calculatePositions(positionRows.map(toChronologicalPositionTransaction));

  return instrumentRows.map((instrument) => {
    const currentQuantity = positions.get(instrument.id)?.quantity ?? 0;

    return mapInstrumentOption(instrument, currentQuantity);
  });
}

export async function listSelectableTransactionInstrumentOptions({
  portfolioId,
}: {
  portfolioId: number;
}) {
  const instruments = await listTransactionInstrumentOptions({ portfolioId, activeOnly: false });

  return instruments.filter(isTransactionInstrumentSelectable);
}
