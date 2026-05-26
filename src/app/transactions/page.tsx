import { TransactionWorkspaceClient } from "@/components/transaction-workspace-client";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getPortfolioSelection, isAllPortfoliosSelection } from "@/lib/portfolio/selection";
import { getUiCopy } from "@/lib/ui/copy";
import { getServerUiLanguage } from "@/lib/ui/server";
import { getAggregateTransactionWorkspace, getTransactionWorkspace } from "@/server/transactions";

export const dynamic = "force-dynamic";

type TransactionsPageProps = {
  searchParams?: Promise<{
    edit?: string | string[];
  }>;
};

function parseEditTransactionId(edit: string | string[] | undefined) {
  const value = Array.isArray(edit) ? edit[0] : edit;
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const language = await getServerUiLanguage();
  const copy = getUiCopy(language);
  const isAdmin = await isAdminAuthenticated();
  const { selectedPortfolio } = await getPortfolioSelection();
  const isAggregatePortfolio = isAllPortfoliosSelection(selectedPortfolio);
  const resolvedSearchParams = await searchParams;
  const editTransactionId = isAdmin && !isAggregatePortfolio ? parseEditTransactionId(resolvedSearchParams?.edit) : null;
  const {
    allInstruments,
    editingTransaction,
    instruments,
    summary,
    transactions
  } = isAggregatePortfolio
    ? await getAggregateTransactionWorkspace({
        editTransactionId: null
      })
    : await getTransactionWorkspace({
        editTransactionId,
        portfolioId: selectedPortfolio.id
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
      selectedPortfolioName={isAggregatePortfolio ? copy.shell.allPortfolios : selectedPortfolio.name}
    />
  );
}
