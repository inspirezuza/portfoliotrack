import { isAdminAuthenticated } from "@/lib/auth/admin";
import {
  AggregatePortfolioSelectionError,
  getSelectedPortfolioId,
} from "@/lib/portfolio/selection";
import { ensureDefaultPortfolio } from "@/server/portfolios";
import { buildTransactionExport } from "@/server/transaction-import-export";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const template = searchParams.get("template") === "true";

    if (!template && !(await isAdminAuthenticated())) {
      return Response.json(
        {
          error: {
            code: "ADMIN_REQUIRED",
            message: "Admin login is required to export transactions.",
          },
        },
        { status: 401 },
      );
    }

    const portfolioId = template
      ? await getSelectedPortfolioId().catch(async (error: unknown) => {
          if (error instanceof AggregatePortfolioSelectionError) {
            return (await ensureDefaultPortfolio()).id;
          }

          throw error;
        })
      : await getSelectedPortfolioId();
    const exportFile = await buildTransactionExport({ portfolioId, template });

    return new Response(new Uint8Array(exportFile.buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportFile.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AggregatePortfolioSelectionError) {
      return Response.json(
        {
          error: {
            code: "AGGREGATE_PORTFOLIO_SELECTION",
            message: "Choose a specific portfolio before exporting transactions.",
          },
        },
        { status: 409 },
      );
    }

    console.error("Unexpected transaction export failure", error);

    return Response.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Transaction export failed.",
        },
      },
      { status: 500 },
    );
  }
}
