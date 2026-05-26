export type TimeAxisPoint = {
  date: string;
  timestamp: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseChartDate(value: string) {
  return new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`);
}

export function isIntradayDate(value: string) {
  return value.includes("T");
}

export function isIntradayInterval(interval: string | null | undefined) {
  return interval != null && interval !== "1d";
}

export function isIntradayPoint(point: { date: string; interval?: string | null }) {
  return isIntradayInterval(point.interval) || (point.interval == null && isIntradayDate(point.date));
}

export function isDailyPoint(point: { date: string; interval?: string | null }) {
  return point.interval === "1d" || (point.interval == null && !isIntradayDate(point.date));
}

export function getUtcDateTime(value: string) {
  return parseChartDate(value).getTime();
}

export function attachTimeAxis<T extends { date: string }>(points: T[]) {
  return points.map((point) => ({
    ...point,
    timestamp: getUtcDateTime(point.date)
  }));
}

export function getTimeAxisDomain(points: TimeAxisPoint[]) {
  if (points.length === 0) {
    return undefined;
  }

  return [
    Math.min(...points.map((point) => point.timestamp)),
    Math.max(...points.map((point) => point.timestamp))
  ] satisfies [number, number];
}

export function buildTimeAxisTicks(points: TimeAxisPoint[], maxTicks = 6) {
  const domain = getTimeAxisDomain(points);

  if (domain == null) {
    return undefined;
  }

  const [start, end] = domain;

  if (start === end) {
    return [start];
  }

  const uniqueDataTicks = Array.from(new Set(points.map((point) => point.timestamp))).sort(
    (left, right) => left - right
  );

  if (uniqueDataTicks.length <= maxTicks) {
    return uniqueDataTicks;
  }

  const safeTickCount = Math.max(2, maxTicks);
  const step = (end - start) / (safeTickCount - 1);

  return Array.from({ length: safeTickCount }, (_, index) =>
    index === safeTickCount - 1 ? end : Math.round(start + step * index)
  );
}

export function formatTimeAxisTick(value: number | string, locale: string, spanMs: number) {
  const timestamp = typeof value === "number" ? value : Number(value);
  const date = new Date(timestamp);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  if (spanMs <= 2 * DAY_MS) {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC"
    }).format(date);
  }

  if (spanMs <= 90 * DAY_MS) {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  if (spanMs <= 730 * DAY_MS) {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}
