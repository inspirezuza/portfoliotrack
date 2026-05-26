import { isAdminAuthenticated } from "@/lib/auth/admin";
import { AggregatePortfolioSelectionError, getSelectedPortfolioId } from "@/lib/portfolio/selection";
import {
  commitTransactionImport,
  previewTransactionImport,
  TransactionImportExportError
} from "@/server/transaction-import-export";

export const runtime = "nodejs";

const AGGREGATE_SELECTION_MESSAGE =
  "Choose a specific portfolio before importing transactions.";

function getStatusCode(error: TransactionImportExportError) {
  switch (error.code) {
    case "INVALID_MODE":
    case "INVALID_FILE":
    case "IMPORT_TOO_LARGE":
    case "TOO_MANY_ROWS":
      return 400;
    case "IMPORT_HAS_ERRORS":
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
  return Response.json(
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

function isExcelFile(file: File) {
  return (
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

export async function POST(request: Request) {
  try {
    if (!(await isAdminAuthenticated())) {
      return jsonErrorResponse("ADMIN_REQUIRED", "Admin login is required to import transactions.", 401);
    }

    const formData = await request.formData();
    const mode = formData.get("mode");
    const file = formData.get("file");

    if (mode !== "preview" && mode !== "commit") {
      throw new TransactionImportExportError(
        "INVALID_MODE",
        "Import mode must be preview or commit."
      );
    }

    if (!(file instanceof File)) {
      throw new TransactionImportExportError("INVALID_FILE", "Choose an .xlsx file to import.");
    }

    if (!isExcelFile(file)) {
      throw new TransactionImportExportError("INVALID_FILE", "Import file must be an .xlsx workbook.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const portfolioId = await getSelectedPortfolioId();
    const preview =
      mode === "preview"
        ? await previewTransactionImport(buffer, { portfolioId })
        : await commitTransactionImport(buffer, { portfolioId });

    return Response.json({
      mode,
      preview
    });
  } catch (error) {
    if (error instanceof AggregatePortfolioSelectionError) {
      return jsonErrorResponse("AGGREGATE_PORTFOLIO_SELECTION", AGGREGATE_SELECTION_MESSAGE, 409);
    }

    if (error instanceof TransactionImportExportError) {
      return jsonErrorResponse(
        error.code,
        error.message,
        getStatusCode(error),
        error.details
      );
    }

    console.error("Unexpected transaction import failure", error);

    return jsonErrorResponse("INTERNAL_ERROR", "Transaction import failed.", 500);
  }
}
