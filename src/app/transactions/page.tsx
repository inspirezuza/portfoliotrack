import { TransactionForm } from "@/components/transaction-form";
import { TransactionTable } from "@/components/transaction-table";
import { formatQuantity } from "@/lib/format";
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
  const setupStatus =
    transactionCount === 0
      ? "No trades are recorded yet. Your first saved buy unlocks holdings, dashboard valuation, and asset-level cost tracking."
      : instruments.length === 0
        ? "Every tracked instrument is currently unavailable for new entry. Add another instrument or reopen one with available quantity before recording the next trade."
        : `${instruments.length} instrument${instruments.length === 1 ? " is" : "s are"} ready for quick entry right now.`;

  return (
    <section className="transactions-page">
      <article className="hero-card transactions-hero">
        <div className="hero-copy">
          <p className="eyebrow">Transaction workspace</p>
          <h1>Enter trades quickly, keep the ledger honest.</h1>
          <p>
            Record buys and sells against your real instrument list, keep fees attached, and let
            the server block impossible sell quantities before they land.
          </p>
          <span className="feature-accent">Manual entry, local validation, immediate refresh</span>
        </div>

        <div className="hero-stats">
          <article className="metric-card">
            <p className="metric-value">{transactionCount}</p>
            <p className="metric-label">Transactions recorded</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{uniqueInstrumentCount}</p>
            <p className="metric-label">Instruments traded</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{openInstrumentCount}</p>
            <p className="metric-label">Open positions from trades</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{latestTradeDate}</p>
            <p className="metric-label">Latest trade date</p>
          </article>
        </div>
      </article>

      <article className="status-banner status-banner-neutral">
        <div>
          <p className="status-banner-title">Entry readiness</p>
          <p className="status-banner-copy">{setupStatus}</p>
        </div>
      </article>

      <div className="transactions-layout">
        <TransactionForm instruments={instruments} />
        <aside className="feature-stack">
          <article className="feature-card">
            <p className="eyebrow">Selection details</p>
            <h3>Symbols come with context</h3>
            <p>
              The form uses instrument labels instead of raw IDs, and each option carries market
              and currency context so manual entry stays fast even as the list grows.
            </p>
          </article>
          <article className="feature-card">
            <p className="eyebrow">Sell guardrail</p>
            <h3>Holdings cannot go below zero</h3>
            <p>
              Current quantities are derived from recorded trades. A sell greater than available
              quantity is rejected server-side before it can change the ledger.
            </p>
          </article>
          <article className="feature-card">
            <p className="eyebrow">Current coverage</p>
            <h3>{instruments.length} selectable instruments</h3>
            <p>
              {allInstruments.length > 0
                ? `Available quantities now: ${allInstruments
                    .map((instrument) => `${instrument.symbol} ${formatQuantity(instrument.currentQuantity)}`)
                    .join(" - ")}`
                : "No instruments available for entry yet. Add the first instrument metadata before recording trades."}
            </p>
          </article>
        </aside>
      </div>

      <TransactionTable transactions={transactions} />
    </section>
  );
}
