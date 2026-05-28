export function getLocalIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function buildTransactionExportFileName({
  now = new Date(),
  template,
}: {
  now?: Date;
  template: boolean;
}) {
  return template
    ? "PortfolioTrack-transaction-template.xlsx"
    : `PortfolioTrack-transactions-${getLocalIsoDate(now)}.xlsx`;
}
