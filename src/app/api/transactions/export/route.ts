import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getSelectedPortfolioId } from "@/lib/portfolio/selection";
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
            message: "Admin login is required to export transactions."
          }
        },
        { status: 401 }
      );
    }

    const portfolioId = await getSelectedPortfolioId();
    const exportFile = await buildTransactionExport({ portfolioId, template });

    return new Response(new Uint8Array(exportFile.buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportFile.fileName}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Unexpected transaction export failure", error);

    return Response.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Transaction export failed."
        }
      },
      { status: 500 }
    );
  }
}
