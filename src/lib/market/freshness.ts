export function getPriceAgeMinutes(asOf: string | null, now = new Date()) {
  if (asOf == null) {
    return null;
  }

  const timestamp = Date.parse(asOf);

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - timestamp) / 60000));
}

export function isMarketDataStale(asOf: string | null, refreshMinutes: number, now = new Date()) {
  const ageMinutes = getPriceAgeMinutes(asOf, now);

  return ageMinutes != null && ageMinutes > refreshMinutes;
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function getCurrentLocalIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

export function getExpectedHistoryTailDate(asOf: string) {
  const snapshotDate = new Date(`${asOf.slice(0, 10)}T00:00:00.000Z`);
  const utcDay = snapshotDate.getUTCDay();

  if (Number.isNaN(snapshotDate.getTime())) {
    return null;
  }

  if (utcDay === 1) {
    return toIsoDate(addDays(snapshotDate, -3));
  }

  if (utcDay === 0) {
    return toIsoDate(addDays(snapshotDate, -2));
  }

  if (utcDay === 6) {
    return toIsoDate(addDays(snapshotDate, -1));
  }

  return toIsoDate(addDays(snapshotDate, -1));
}
