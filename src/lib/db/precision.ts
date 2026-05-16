const MONEY_DECIMALS = 2;
const PRICE_DECIMALS = 4;
const QUANTITY_DECIMALS = 6;

export const FLOAT_TOLERANCE = 1e-9;

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  const epsilon = value === 0 ? 0 : Math.sign(value) * Number.EPSILON;
  return Math.round((value + epsilon) * factor) / factor;
}

export function normalizeMoney(value: number) {
  return roundTo(value, MONEY_DECIMALS);
}

export function normalizePrice(value: number) {
  return roundTo(value, PRICE_DECIMALS);
}

export function normalizeQuantity(value: number) {
  return roundTo(value, QUANTITY_DECIMALS);
}

export function nearlyEqual(left: number, right: number, tolerance = FLOAT_TOLERANCE) {
  return Math.abs(left - right) <= tolerance;
}
