import { redirect } from "next/navigation";
import { TransactionWorkspaceClient } from "@/components/transaction-workspace-client";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import {
  getPortfolioSelectionMemoryPath,
  getPortfolioTransactionsPath,
  parsePortfolioRouteKey,
} from "@/lib/portfolio/paths";
import {
  getPortfolioSelection,
  getRememberedPortfolioKey,
  isAllPortfoliosSelection,
} from "@/lib/portfolio/selection";
import { getUiCopy } from "@/lib/ui/copy";
import { getServerUiLanguage } from "@/lib/ui/server";
import { getAggregateTransactionWorkspace, getTransactionWorkspace } from "@/server/transactions";

export const dynamic = "force-dynamic";

type TransactionsPageProps = {
  portfolioKey?: string | null;
  searchParams?: Promise<{
    edit?: string | string[];
  }>;
};

function parseEditTransactionId(edit: string | string[] | undefined) {
  const value = Array.isArray(edit) ? edit[0] : edit;
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

function appendSearchParams(
  path: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    } else if (value != null) {
      params.set(key, value);
    }
  }

  const queryString = params.toString();

  return queryString ? `${path}?${queryString}` : path;
}

export default async function TransactionsPage({
  portfolioKey,
  searchParams,
}: TransactionsPageProps) {
  const language = await getServerUiLanguage();
  const copy = getUiCopy(language);
  const isAdmin = await isAdminAuthenticated();
  const resolvedSearchParams = (await searchParams) ?? {};
  const { selectedPortfolio } = await getPortfolioSelection({ portfolioKey });
  const selectedPortfolioTransactionsPath = appendSearchParams(
    getPortfolioTransactionsPath(selectedPortfolio.key),
    resolvedSearchParams,
  );

  if (portfolioKey != null) {
    const routePortfolioKey = parsePortfolioRouteKey(portfolioKey);

    if (routePortfolioKey !== selectedPortfolio.key) {
      redirect(selectedPortfolioTransactionsPath);
    }

    const rememberedPortfolioKey = await getRememberedPortfolioKey();

    if (rememberedPortfolioKey !== selectedPortfolio.key) {
      redirect(
        getPortfolioSelectionMemoryPath(selectedPortfolio.key, selectedPortfolioTransactionsPath),
      );
    }
  }

  const isAggregatePortfolio = isAllPortfoliosSelection(selectedPortfolio);
  const editTransactionId =
    isAdmin && !isAggregatePortfolio ? parseEditTransactionId(resolvedSearchParams?.edit) : null;
  const { allInstruments, editingTransaction, instruments, summary, transactions } =
    isAggregatePortfolio
      ? await getAggregateTransactionWorkspace({
          editTransactionId: null,
        })
      : await getTransactionWorkspace({
          editTransactionId,
          portfolioId: selectedPortfolio.id,
        });

  return (
    <TransactionWorkspaceClient
      canEdit={isAdmin && !isAggregatePortfolio}
      initialAllInstruments={allInstruments}
      initialEditingTransaction={editingTransaction}
      initialInstruments={instruments}
      initialSummary={summary}
      initialTransactions={transactions}
      isAggregatePortfolio={isAggregatePortfolio}
      language={language}
      selectedPortfolioKey={selectedPortfolio.key}
      selectedPortfolioName={
        isAggregatePortfolio ? copy.shell.allPortfolios : selectedPortfolio.name
      }
      transactionsPath={getPortfolioTransactionsPath(selectedPortfolio.key)}
    />
  );
}
