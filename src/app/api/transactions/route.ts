import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import {
  AggregatePortfolioSelectionError,
  getPortfolioSelection,
  getSelectedPortfolioId,
  isAllPortfoliosSelection
} from "@/lib/portfolio/selection";
import {
  createTransaction,
  deleteTransaction,
  getAggregateTransactionWorkspace,
  getTransactionWorkspace,
  TransactionServiceError,
  updateTransaction,
  type TransactionListItem
} from "@/server/transactions";

function getStatusCode(error: TransactionServiceError) {
  switch (error.code) {
    case "VALIDATION_ERROR":
      return 400;
    case "INSTRUMENT_NOT_FOUND":
    case "TRANSACTION_NOT_FOUND":
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

function aggregateSelectionErrorResponse() {
  return jsonErrorResponse(
    "AGGREGATE_PORTFOLIO_SELECTION",
    "Choose a specific portfolio before changing transactions.",
    409
  );
}

function sortTransactionsByOrder(transactions: TransactionListItem[], order: "asc" | "desc") {
  if (order === "desc") {
    return transactions;
  }

  return [...transactions].sort((left, right) => {
    const tradeDateComparison = left.tradeDate.localeCompare(right.tradeDate);

    if (tradeDateComparison !== 0) {
      return tradeDateComparison;
    }

    const createdAtComparison = left.createdAt.localeCompare(right.createdAt);

    return createdAtComparison !== 0 ? createdAtComparison : left.id - right.id;
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const editTransactionId = Number(searchParams.get("edit"));
    const order = searchParams.get("order") === "asc" ? "asc" : "desc";
    const selection = await getPortfolioSelection();
    const parsedEditTransactionId =
      Number.isInteger(editTransactionId) && editTransactionId > 0 ? editTransactionId : null;
    const workspace = isAllPortfoliosSelection(selection.selectedPortfolio)
      ? await getAggregateTransactionWorkspace({
          editTransactionId: parsedEditTransactionId
        })
      : await getTransactionWorkspace({
          editTransactionId: parsedEditTransactionId,
          portfolioId: selection.selectedPortfolio.id
        });

    return NextResponse.json({
      allInstruments: workspace.allInstruments,
      editingTransaction: workspace.editingTransaction,
      formInstruments: workspace.formInstruments,
      instruments: workspace.instruments,
      summary: workspace.summary,
      transactions: sortTransactionsByOrder(workspace.transactions, order)
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
    if (!(await isAdminAuthenticated())) {
      return jsonErrorResponse("ADMIN_REQUIRED", "Admin login is required to change transactions.", 401);
    }

    const payload = await request.json();
    const portfolioId = await getSelectedPortfolioId();
    const transaction = await createTransaction(payload, { portfolioId });

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    if (error instanceof AggregatePortfolioSelectionError) {
      return aggregateSelectionErrorResponse();
    }

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

export async function PUT(request: Request) {
  try {
    if (!(await isAdminAuthenticated())) {
      return jsonErrorResponse("ADMIN_REQUIRED", "Admin login is required to change transactions.", 401);
    }

    const payload = await request.json();

    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TransactionServiceError(
        "VALIDATION_ERROR",
        "Transaction update payload must be an object."
      );
    }

    const { id, ...transactionPayload } = payload as Record<string, unknown>;
    const portfolioId = await getSelectedPortfolioId();
    const transaction = await updateTransaction(id, transactionPayload, { portfolioId });

    return NextResponse.json({ transaction });
  } catch (error) {
    if (error instanceof AggregatePortfolioSelectionError) {
      return aggregateSelectionErrorResponse();
    }

    if (error instanceof TransactionServiceError) {
      return jsonErrorResponse(error.code, error.message, getStatusCode(error), error.details);
    }

    if (error instanceof SyntaxError) {
      return jsonErrorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
    }

    console.error("Unexpected transaction update failure", error);

    return jsonErrorResponse("INTERNAL_ERROR", "Transaction could not be updated.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await isAdminAuthenticated())) {
      return jsonErrorResponse("ADMIN_REQUIRED", "Admin login is required to change transactions.", 401);
    }

    const payload = await request.json();

    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TransactionServiceError(
        "VALIDATION_ERROR",
        "Transaction delete payload must be an object."
      );
    }

    const portfolioId = await getSelectedPortfolioId();
    const deletedTransaction = await deleteTransaction((payload as Record<string, unknown>).id, { portfolioId });

    return NextResponse.json({ transaction: deletedTransaction });
  } catch (error) {
    if (error instanceof AggregatePortfolioSelectionError) {
      return aggregateSelectionErrorResponse();
    }

    if (error instanceof TransactionServiceError) {
      return jsonErrorResponse(error.code, error.message, getStatusCode(error), error.details);
    }

    if (error instanceof SyntaxError) {
      return jsonErrorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
    }

    console.error("Unexpected transaction delete failure", error);

    return jsonErrorResponse("INTERNAL_ERROR", "Transaction could not be deleted.", 500);
  }
}
