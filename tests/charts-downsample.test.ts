import assert from "node:assert/strict";
import test from "node:test";
import {
  downsampleLttb,
  reduceTimelineResolution,
  type ResolutionReduceOptions,
} from "../src/lib/charts/downsample";

type DailyPoint = { date: string; value: number; interval?: string | null };

function dailyDate(dayOffset: number) {
  const base = Date.UTC(2024, 0, 1) + dayOffset * 24 * 60 * 60 * 1000;

  return new Date(base).toISOString().slice(0, 10);
}

function makeDaily(count: number, getValue: (index: number) => number): DailyPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    date: dailyDate(index),
    value: getValue(index),
    interval: "1d" as const,
  }));
}

test("downsampleLttb returns the input untouched when below threshold", () => {
  const points = makeDaily(5, (index) => index);

  assert.deepEqual(
    downsampleLttb(points, 10, (point) => point.value),
    points,
  );
});

test("downsampleLttb caps the count and preserves the first and last points", () => {
  const points = makeDaily(1000, (index) => Math.sin(index / 10) * 100);
  const reduced = downsampleLttb(points, 100, (point) => point.value);

  assert.equal(reduced.length, 100);
  assert.equal(reduced[0].date, points[0].date);
  assert.equal(reduced[reduced.length - 1].date, points[points.length - 1].date);
});

test("downsampleLttb keeps a sharp spike that uniform sampling would drop", () => {
  const points = makeDaily(200, () => 1);
  // A single tall spike in the interior.
  points[123] = { ...points[123], value: 9999 };

  const reduced = downsampleLttb(points, 20, (point) => point.value);

  assert.ok(
    reduced.some((point) => point.value === 9999),
    "expected the spike to survive downsampling",
  );
});

test("downsampleLttb stays sorted and never duplicates the anchor", () => {
  const points = makeDaily(500, (index) => index % 7);
  const reduced = downsampleLttb(points, 50, (point) => point.value);

  for (let index = 1; index < reduced.length; index += 1) {
    assert.ok(
      reduced[index].date > reduced[index - 1].date,
      "downsampled points must be strictly increasing in time",
    );
  }
});

const RESOLUTION_OPTIONS: ResolutionReduceOptions = {
  dailyBudget: 100,
  intradayMaxAgeDays: { "5m": 3, "1h": 35, default: 35 },
};

test("reduceTimelineResolution caps the daily band to the budget", () => {
  const points = makeDaily(600, (index) => index);
  const reduced = reduceTimelineResolution(points, (point) => point.value, RESOLUTION_OPTIONS);

  assert.equal(reduced.length, 100);
});

test("reduceTimelineResolution drops intraday bars older than their window but keeps recent ones in full", () => {
  const latest = Date.UTC(2024, 5, 1, 16, 0, 0);
  const hour = 60 * 60 * 1000;
  // 1h bars spanning 50 days back from `latest`, one per hour.
  const intraday: DailyPoint[] = Array.from({ length: 50 * 24 }, (_, index) => ({
    date: new Date(latest - index * hour).toISOString(),
    value: index,
    interval: "1h" as const,
  }));

  const reduced = reduceTimelineResolution(intraday, (point) => point.value, RESOLUTION_OPTIONS);

  // Window is 35 days; nothing older should survive, everything within is kept.
  const cutoff = latest - 35 * 24 * hour;

  assert.ok(reduced.length > 0);
  assert.ok(
    reduced.every((point) => new Date(point.date).getTime() >= cutoff),
    "no bar older than the 35-day window should remain",
  );
  // The most recent bar is always retained.
  assert.equal(reduced[reduced.length - 1].value, 0);
});

test("reduceTimelineResolution keeps 5m bars only within their tighter window", () => {
  const latest = Date.UTC(2024, 5, 1, 16, 0, 0);
  const fiveMin = 5 * 60 * 1000;
  // 5m bars spanning 10 days back.
  const intraday: DailyPoint[] = Array.from({ length: 10 * 24 * 12 }, (_, index) => ({
    date: new Date(latest - index * fiveMin).toISOString(),
    value: index,
    interval: "5m" as const,
  }));

  const reduced = reduceTimelineResolution(intraday, (point) => point.value, RESOLUTION_OPTIONS);
  const cutoff = latest - 3 * 24 * 60 * 60 * 1000;

  assert.ok(
    reduced.every((point) => new Date(point.date).getTime() >= cutoff),
    "5m bars older than 3 days should be dropped",
  );
});

test("reduceTimelineResolution merges daily + intraday and stays time-sorted", () => {
  const latest = Date.UTC(2024, 5, 1, 16, 0, 0);
  const hour = 60 * 60 * 1000;
  const daily = makeDaily(600, (index) => index);
  const intraday: DailyPoint[] = Array.from({ length: 100 }, (_, index) => ({
    date: new Date(latest - index * hour).toISOString(),
    value: 1000 + index,
    interval: "1h" as const,
  }));

  const reduced = reduceTimelineResolution(
    [...daily, ...intraday],
    (point) => point.value,
    RESOLUTION_OPTIONS,
  );

  for (let index = 1; index < reduced.length; index += 1) {
    assert.ok(
      new Date(reduced[index].date).getTime() >= new Date(reduced[index - 1].date).getTime(),
      "combined series must be sorted by time",
    );
  }
  // Daily portion is capped; intraday within window is kept in full.
  assert.ok(reduced.length <= 100 + 100);
});

test("reduceTimelineResolution returns empty for empty input", () => {
  assert.deepEqual(
    reduceTimelineResolution([] as DailyPoint[], (point) => point.value, RESOLUTION_OPTIONS),
    [],
  );
});
