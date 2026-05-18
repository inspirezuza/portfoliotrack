import { TransactionForm } from "@/components/transaction-form";
import { TransactionExcelTools } from "@/components/transaction-excel-tools";
import { TransactionTable } from "@/components/transaction-table";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getPortfolioSelection } from "@/lib/portfolio/selection";
import { getUiCopy } from "@/lib/ui/copy";
import { getServerUiLanguage } from "@/lib/ui/server";
import { getTransactionWorkspace } from "@/server/transactions";

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
  const resolvedSearchParams = await searchParams;
  const editTransactionId = isAdmin ? parseEditTransactionId(resolvedSearchParams?.edit) : null;
  const {
    editingTransaction,
    formInstruments,
    summary,
    transactions
  } = await getTransactionWorkspace({
    editTransactionId,
    portfolioId: selectedPortfolio.id
  });
  const latestTradeDate = summary.latestTradeDate ?? copy.shared.noTradesYet;

  return (
    <section className="transactions-page transactions-workspace">
      <div className="workstation-topbar">
        <div>
          <p className="eyebrow">{copy.transactions.pageEyebrow}</p>
          <h1>{copy.transactions.pageTitle}</h1>
          <p>{copy.transactions.pageDescription} {selectedPortfolio.name}</p>
        </div>
      </div>

      <div className="transaction-summary-strip" aria-label={copy.transactions.summaryLabel}>
        <div>
          <span>{copy.transactions.recorded}</span>
          <strong>{summary.transactionCount}</strong>
        </div>
        <div>
          <span>{copy.transactions.traded}</span>
          <strong>{summary.uniqueInstrumentCount}</strong>
        </div>
        <div>
          <span>{copy.transactions.open}</span>
          <strong>{summary.openInstrumentCount}</strong>
        </div>
        <div>
          <span>{copy.transactions.latest}</span>
          <strong>{latestTradeDate}</strong>
        </div>
        <div>
          <span>{copy.transactions.selectable}</span>
          <strong>{summary.selectableInstrumentCount}</strong>
        </div>
        <div>
          <span>{copy.transactions.allInstruments}</span>
          <strong>{summary.allInstrumentCount}</strong>
        </div>
      </div>

      {isAdmin ? (
        <>
          <TransactionForm
            instruments={formInstruments}
            editingTransaction={editingTransaction}
            language={language}
          />
          <TransactionExcelTools language={language} />
        </>
      ) : null}
      <TransactionTable
        transactions={transactions}
        editingTransactionId={editingTransaction?.id ?? null}
        language={language}
        canEdit={isAdmin}
      />
    </section>
  );
}
