export function parsePortfolioId(input: unknown) {
  const id = Number(input);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Portfolio id must be a positive integer.");
  }

  return id;
}
