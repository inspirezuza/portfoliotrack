import { TransactionForm } from "@/components/transaction-form";
import { TransactionTable } from "@/components/transaction-table";
import {
  listSelectableTransactionInstrumentOptions,
  listTransactionInstrumentOptions,
  listTransactions
} from "@/server/transactions";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const [transactions, allInstruments, instruments] = await Promise.all([
    listTransactions({ order: "desc" }),
    listTransactionInstrumentOptions({ activeOnly: false }),
    listSelectableTransactionInstrumentOptions()
  ]);

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
        <TransactionForm instruments={instruments} />
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

      <TransactionTable transactions={transactions} />
    </section>
  );
}
