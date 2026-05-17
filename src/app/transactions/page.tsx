import { TransactionForm } from "@/components/transaction-form";
import { TransactionTable } from "@/components/transaction-table";
import { sortInstrumentOptions } from "@/lib/transactions/instrument-selection";
import { getUiCopy } from "@/lib/ui/copy";
import { getServerUiLanguage } from "@/lib/ui/server";
import {
  listSelectableTransactionInstrumentOptions,
  listTransactionInstrumentOptions,
  listTransactions
} from "@/server/transactions";

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
  const resolvedSearchParams = await searchParams;
  const editTransactionId = parseEditTransactionId(resolvedSearchParams?.edit);
  const [transactions, allInstruments, instruments] = await Promise.all([
    listTransactions({ order: "desc" }),
    listTransactionInstrumentOptions({ activeOnly: false }),
    listSelectableTransactionInstrumentOptions()
  ]);
  const editingTransaction =
    editTransactionId == null
      ? null
      : transactions.find((transaction) => transaction.id === editTransactionId) ?? null;
  const formInstruments =
    editingTransaction && !instruments.some((instrument) => instrument.id === editingTransaction.instrumentId)
      ? sortInstrumentOptions([
          ...instruments,
          ...allInstruments.filter((instrument) => instrument.id === editingTransaction.instrumentId)
        ])
      : instruments;

  const transactionCount = transactions.length;
  const uniqueInstrumentCount = new Set(transactions.map((transaction) => transaction.instrumentId))
    .size;
  const latestTradeDate = transactions[0]?.tradeDate ?? copy.shared.noTradesYet;
  const openInstrumentCount = allInstruments.filter(
    (instrument) => instrument.currentQuantity > 0
  ).length;

  return (
    <section className="transactions-page transactions-workspace">
      <div className="workstation-topbar">
        <div>
          <p className="eyebrow">{copy.transactions.pageEyebrow}</p>
          <h1>{copy.transactions.pageTitle}</h1>
          <p>{copy.transactions.pageDescription}</p>
        </div>
      </div>

      <div className="transaction-summary-strip" aria-label={copy.transactions.summaryLabel}>
        <div>
          <span>{copy.transactions.recorded}</span>
          <strong>{transactionCount}</strong>
        </div>
        <div>
          <span>{copy.transactions.traded}</span>
          <strong>{uniqueInstrumentCount}</strong>
        </div>
        <div>
          <span>{copy.transactions.open}</span>
          <strong>{openInstrumentCount}</strong>
        </div>
        <div>
          <span>{copy.transactions.latest}</span>
          <strong>{latestTradeDate}</strong>
        </div>
        <div>
          <span>{copy.transactions.selectable}</span>
          <strong>{instruments.length}</strong>
        </div>
        <div>
          <span>{copy.transactions.allInstruments}</span>
          <strong>{allInstruments.length}</strong>
        </div>
      </div>

      <TransactionForm
        instruments={formInstruments}
        editingTransaction={editingTransaction}
        language={language}
      />
      <TransactionTable
        transactions={transactions}
        editingTransactionId={editingTransaction?.id ?? null}
        language={language}
      />
    </section>
  );
}
