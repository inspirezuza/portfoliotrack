"use client";

import { SortableHeader } from "@/components/transaction-table/sortable-header";
import type { SortState, TransactionSortKey } from "@/components/transaction-table/table-helpers";
import type { getUiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";

type TransactionLedgerHeadProps = {
  canEdit: boolean;
  copy: ReturnType<typeof getUiCopy>;
  language: UiLanguage;
  onSort: (sortKey: TransactionSortKey) => void;
  showPortfolioColumn: boolean;
  sort: SortState;
};

export function TransactionLedgerHead({
  canEdit,
  copy,
  language,
  onSort,
  showPortfolioColumn,
  sort,
}: TransactionLedgerHeadProps) {
  return (
    <thead>
      <tr>
        <SortableHeader
          label={copy.transactions.table.columns.date}
          language={language}
          sortKey="tradeDate"
          sort={sort}
          onSort={onSort}
        />
        <SortableHeader
          label={copy.transactions.table.columns.instrument}
          language={language}
          sortKey="instrument"
          sort={sort}
          onSort={onSort}
        />
        {showPortfolioColumn ? (
          <SortableHeader
            label={copy.transactions.table.columns.portfolio}
            language={language}
            sortKey="portfolio"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        <SortableHeader
          label={copy.transactions.table.columns.side}
          language={language}
          sortKey="side"
          sort={sort}
          onSort={onSort}
        />
        <SortableHeader
          label={copy.transactions.table.columns.broker}
          language={language}
          sortKey="broker"
          sort={sort}
          onSort={onSort}
        />
        <SortableHeader
          label={copy.transactions.table.columns.quantity}
          language={language}
          sortKey="quantity"
          sort={sort}
          onSort={onSort}
          align="right"
        />
        <SortableHeader
          label={copy.transactions.table.columns.price}
          language={language}
          sortKey="price"
          sort={sort}
          onSort={onSort}
          align="right"
        />
        <SortableHeader
          label={copy.transactions.table.columns.fee}
          language={language}
          sortKey="fee"
          sort={sort}
          onSort={onSort}
          align="right"
        />
        <SortableHeader
          label={copy.transactions.table.columns.net}
          language={language}
          sortKey="netAmount"
          sort={sort}
          onSort={onSort}
          align="right"
        />
        <th scope="col">{copy.transactions.table.columns.notes}</th>
        {canEdit ? <th scope="col">{copy.transactions.table.columns.actions}</th> : null}
      </tr>
    </thead>
  );
}
