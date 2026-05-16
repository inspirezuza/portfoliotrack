import { TransactionForm } from "@/components/transaction-form";
import { TransactionTable } from "@/components/transaction-table";
import { sortInstrumentOptions } from "@/lib/transactions/instrument-selection";
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
  const latestTradeDate = transactions[0]?.tradeDate ?? "No trades yet";
  const openInstrumentCount = allInstruments.filter(
    (instrument) => instrument.currentQuantity > 0
  ).length;

  return (
    <section className="transactions-page transactions-workspace">
      <div className="workstation-topbar">
        <div>
          <p className="eyebrow">Transactions</p>
          <h1>Record a trade</h1>
        </div>
      </div>

      <div className="transactions-layout">
        <TransactionForm instruments={formInstruments} editingTransaction={editingTransaction} />
        <aside className="feature-stack">
          <article className="surface-card transaction-overview-card">
            <p className="eyebrow">State</p>
            <h2 className="side-card-title">Ledger</h2>
            <div className="compact-stat-grid">
              <div>
                <span>Recorded</span>
                <strong>{transactionCount}</strong>
              </div>
              <div>
                <span>Traded</span>
                <strong>{uniqueInstrumentCount}</strong>
              </div>
              <div>
                <span>Open</span>
                <strong>{openInstrumentCount}</strong>
              </div>
              <div>
                <span>Latest</span>
                <strong>{latestTradeDate}</strong>
              </div>
            </div>
          </article>
          <article className="surface-card transaction-overview-card">
            <p className="eyebrow">Instruments</p>
            <h2 className="side-card-title">{instruments.length} selectable</h2>
            <div className="compact-stat-grid">
              <div>
                <span>All</span>
                <strong>{allInstruments.length}</strong>
              </div>
              <div>
                <span>Open</span>
                <strong>{openInstrumentCount}</strong>
              </div>
            </div>
          </article>
        </aside>
      </div>

      <TransactionTable transactions={transactions} editingTransactionId={editingTransaction?.id ?? null} />
    </section>
  );
}
