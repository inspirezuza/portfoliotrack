import { normalizeMoney } from "@/lib/db/precision";

function toDayStartTimestamp(value: string) {
  return `${value}T00:00:00.000Z`;
}

function toTradeDay(value: string) {
  return value.slice(0, 10);
}

export function daysBetween(startDate: string, endDate: string) {
  const startTime = Date.parse(toDayStartTimestamp(toTradeDay(startDate)));
  const endTime = Date.parse(toDayStartTimestamp(toTradeDay(endDate)));

  return (endTime - startTime) / 86_400_000;
}

export function calculateNetPresentValue(
  cashFlows: Array<{ date: string; amount: number }>,
  annualRate: number,
) {
  const firstDate = cashFlows[0]?.date;

  if (firstDate == null || annualRate <= -1) {
    return null;
  }

  return cashFlows.reduce((total, cashFlow) => {
    const years = daysBetween(firstDate, cashFlow.date) / 365;

    return total + cashFlow.amount / Math.pow(1 + annualRate, years);
  }, 0);
}

export function calculateXirr(cashFlows: Array<{ date: string; amount: number }>) {
  const validCashFlows = cashFlows.filter((cashFlow) => cashFlow.amount !== 0);
  const hasPositive = validCashFlows.some((cashFlow) => cashFlow.amount > 0);
  const hasNegative = validCashFlows.some((cashFlow) => cashFlow.amount < 0);

  if (validCashFlows.length < 2 || !hasPositive || !hasNegative) {
    return null;
  }

  let low = -0.9999;
  let high = 10;
  let lowValue = calculateNetPresentValue(validCashFlows, low);
  let highValue = calculateNetPresentValue(validCashFlows, high);

  for (
    let expansion = 0;
    expansion < 8 && lowValue != null && highValue != null && lowValue * highValue > 0;
    expansion += 1
  ) {
    high *= 2;
    highValue = calculateNetPresentValue(validCashFlows, high);
  }

  if (lowValue == null || highValue == null || lowValue * highValue > 0) {
    return null;
  }

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const mid = (low + high) / 2;
    const midValue = calculateNetPresentValue(validCashFlows, mid);

    if (midValue == null || Math.abs(midValue) < 0.000001) {
      return mid;
    }

    if (lowValue * midValue <= 0) {
      high = mid;
      highValue = midValue;
    } else {
      low = mid;
      lowValue = midValue;
    }
  }

  return (low + high) / 2;
}

export function calculateAnnualizedReturnPercent({
  endDate,
  endValue,
  startDate,
  startValue,
}: {
  endDate: string;
  endValue: number;
  startDate: string;
  startValue: number;
}) {
  const days = daysBetween(startDate, endDate);

  if (startValue <= 0 || endValue <= 0 || days <= 0) {
    return null;
  }

  return normalizeMoney((Math.pow(endValue / startValue, 365 / days) - 1) * 100);
}
