import { NextResponse } from "next/server";
import {
  createTransaction,
  listSelectableTransactionInstrumentOptions,
  listTransactions,
  TransactionServiceError
} from "@/server/transactions";

function getStatusCode(error: TransactionServiceError) {
  switch (error.code) {
    case "VALIDATION_ERROR":
      return 400;
    case "INSTRUMENT_NOT_FOUND":
      return 404;
    case "INSUFFICIENT_QUANTITY":
      return 409;
    default:
      return 500;
  }
}

function jsonErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown> | null
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details: details ?? null
      }
    },
    { status }
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const order = searchParams.get("order") === "asc" ? "asc" : "desc";

    const [transactions, instruments] = await Promise.all([
      listTransactions({ order }),
      listSelectableTransactionInstrumentOptions()
    ]);

    return NextResponse.json({
      transactions,
      instruments
    });
  } catch (error) {
    if (error instanceof TransactionServiceError) {
      return jsonErrorResponse(error.code, error.message, getStatusCode(error), error.details);
    }

    console.error("Unexpected transaction API read failure", error);

    return jsonErrorResponse("INTERNAL_ERROR", "Transactions could not be loaded.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const transaction = await createTransaction(payload);

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    if (error instanceof TransactionServiceError) {
      return jsonErrorResponse(error.code, error.message, getStatusCode(error), error.details);
    }

    if (error instanceof SyntaxError) {
      return jsonErrorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
    }

    console.error("Unexpected transaction API failure", error);

    return jsonErrorResponse("INTERNAL_ERROR", "Transaction could not be saved.", 500);
  }
}
